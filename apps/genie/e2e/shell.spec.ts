import { expect, test, type BrowserContext } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import {
  clearBrandingMark,
  seedBrandingMark,
} from "./support/branding-mark.ts";
import { queryDatabase } from "./support/database.ts";
import { expectSecurityHeaders } from "./support/headers.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { atLg, openNavigation, openUserMenu } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * Spec 3 S3-04b: the shell in the browser (AC-4 shell parts, AC-4a, R-31 to R-42), on the main
 * stack, signed in as this spec's own reader (one realm user per spec and project, so no parallel
 * sign-in trips brute-force protection or replaces the id token Sign out sends). Each screen proof runs at the phone and the desktop
 * project (DEC-25). The branding row is deployment-wide, so a proof that writes it holds the
 * `branding` lock and restores its columns before letting go; readers cache for ten seconds
 * (DEC-46), so every read after a write polls.
 */
test.describe.configure({ timeout: 360_000 });

const POLL = { timeout: 30_000, intervals: [1000] };

/** The other project can hold the branding lock for its whole test. */
const LOCK_WAIT_MS = 300_000;

const OFFLINE =
  "You are offline. Changes will not be saved until the connection returns.";

declare global {
  interface Window {
    /** Written by the init script below; the same recorder `placeholder.spec.ts` installs. */
    genieCspViolations?: string[];
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("shell", testInfo.project.name),
  });
});

/** This browser's session token: the part of the signed cookie before its signature. */
async function sessionToken(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find(
    (entry) => entry.name === "genie-session"
  );

  if (cookie === undefined)
    throw new Error("The browser holds no genie-session cookie");

  return decodeURIComponent(cookie.value).split(".")[0] ?? "";
}

/** The session's last activity in epoch milliseconds, read where the idle rule reads it. */
async function lastActiveAt(token: string): Promise<number> {
  const [value] = await queryDatabase(
    `select (extract(epoch from coalesce(last_active_at, created_at)) * 1000)::bigint from session where token = '${token.replaceAll("'", "''")}'`
  );

  return Number(value);
}

test(
  "a shell route carries the standard headers and the minimal policy (R-42, AC-4)",
  { tag: "@no-screen" },
  async ({ page }) => {
    expectSecurityHeaders(await page.goto("/account"), "shell route");
  }
);

test("the branding style element and the theme script apply under the minimal policy (AC-4a)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.genieCspViolations = [];

    document.addEventListener("securitypolicyviolation", (event) => {
      window.genieCspViolations?.push(
        `${event.violatedDirective} ${event.blockedURI}`
      );
    });
  });
  await page.emulateMedia({ colorScheme: "dark" });

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        await queryDatabase(
          "update tenant_branding set primary_color = '#0f766e', primary_foreground = '#ffffff', default_theme = 'system'"
        );

        await expect
          .poll(async () => {
            await page.goto("/account");

            return page.evaluate(() =>
              getComputedStyle(document.documentElement)
                .getPropertyValue("--primary")
                .trim()
            );
          }, POLL)
          .toBe("#0f766e");

        // The theme script ran: the device is dark and the organization's theme is `system`.
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "dark"
        );
        expect(
          await page
            .locator("head style")
            .evaluateAll((nodes) => nodes.map((node) => node.textContent))
        ).toContainEqual(expect.stringContaining(":root{"));
        await expect(page.locator("script[nonce], style[nonce]")).toHaveCount(
          0
        );
        expect(
          await page.evaluate(() => window.genieCspViolations ?? [])
        ).toEqual([]);
      } finally {
        await queryDatabase(
          "update tenant_branding set primary_color = null, primary_foreground = null, default_theme = 'system'"
        );
      }
    },
    LOCK_WAIT_MS
  );
});

test("the header keeps an empty search slot and shows no bell (R-40)", async ({
  page,
}) => {
  await page.goto("/account");

  const slot = page.locator(
    atLg(page)
      ? '[data-shell-page-header] [data-shell-slot="search"]'
      : '[data-shell-top-bar] [data-shell-slot="search"]'
  );

  await expect(slot).toBeAttached();
  await expect(slot).toBeEmpty();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /notifications/i })).toHaveCount(
    0
  );
  await expectNoAxeViolations(page, "shell header");
});

test("the content area is a named group that a keyboard reaches and scrolls (6wz1.70)", async ({
  page,
}) => {
  await page.goto("/account");

  const account = page.getByTestId("account-page");

  await expect(account).toBeVisible();
  // The taller session card of DR-17, which overflowed the area with nothing in it to focus, stood
  // in for by extra height: the case axe `scrollable-region-focusable` guards.
  await account.evaluate((main) => {
    main.style.paddingBottom = "100vh";
  });

  const content = page.getByRole("group", { name: "Page content" });

  await expect(content).toBeVisible();
  expect(
    await content.evaluate((area) => area.scrollHeight > area.clientHeight)
  ).toBe(true);
  await expectNoAxeViolations(page, "overflowing content area");

  await expect(async () => {
    await page.keyboard.press("Tab");
    await expect(content).toBeFocused({ timeout: 100 });
  }).toPass({ timeout: 15_000 });

  await expect
    .poll(async () => {
      await page.keyboard.press("ArrowDown");

      return content.evaluate((area) => area.scrollTop);
    }, POLL)
    .toBeGreaterThan(0);
});

test("the offline bar spans the viewport above the sidebar and leaves on online (R-35)", async ({
  page,
  context,
}) => {
  await page.goto("/account");
  await context.setOffline(true);

  try {
    const bar = page.getByRole("status").filter({ hasText: OFFLINE });

    await expect(bar).toBeVisible();

    const box = await bar.boundingBox();
    const viewport = page.viewportSize();

    expect(box?.y).toBe(0);
    expect(box?.width).toBe(viewport?.width);

    // The navigation sits below the bar: the aside from `lg`, the top bar below it.
    const below = await page
      .locator(
        atLg(page) ? 'aside[aria-label="Navigation"]' : "[data-shell-top-bar]"
      )
      .boundingBox();

    expect(below?.y).toBeGreaterThanOrEqual((box?.y ?? 0) + (box?.height ?? 0));
    await expectNoAxeViolations(page, "offline bar");
  } finally {
    await context.setOffline(false);
  }

  await expect(page.getByText(OFFLINE)).toHaveCount(0);
});

test("the drawer opens below lg and closes on route change, and the sidebar shows at lg (R-38)", async ({
  page,
}) => {
  await page.goto("/account");

  if (atLg(page)) {
    await expect(
      page.getByRole("button", { name: "Open navigation" })
    ).toBeHidden();
    await expect(
      page.getByRole("complementary", { name: "Navigation" })
    ).toBeVisible();

    return;
  }

  const drawer = await openNavigation(page);

  await expectNoAxeViolations(page, "navigation drawer");
  await drawer
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("link", { name: "Placeholder", exact: true })
    .click();

  await expect(page).toHaveURL(/\/placeholder$/);
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);

  // The scrim beside the drawer closes it.
  await openNavigation(page);

  const viewport = page.viewportSize();

  await page.mouse.click(
    (viewport?.width ?? 0) - 8,
    (viewport?.height ?? 0) / 2
  );
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
});

test("the user menu offers the workspace items, and Sign out ends the session (R-32)", async ({
  page,
}) => {
  await page.goto("/account");

  const publicUrl = new URL(page.url()).origin;
  const menu = await openUserMenu(page);

  await expect(
    menu.getByRole("menuitem", { name: "Account", exact: true })
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Sign out", exact: true })
  ).toBeVisible();
  // The workspace chrome never offers the way back. Whether Administration shows depends on a
  // core admin key; the seeded E2E reader role holds some, so `admin-seed.spec.ts` proves its
  // absence with a person who holds none.
  await expect(
    menu.getByRole("menuitem", { name: "Back to workspace" })
  ).toHaveCount(0);
  await expectNoAxeViolations(page, "user menu");

  await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();

  // The same landing `auth.spec.ts` asserts for the controlled sign-out (R-17a).
  await expect
    .poll(() => page.url(), { timeout: 15_000 })
    .toBe(`${publicUrl}/sign-in?error=signed_out`);
  await expect(page.getByTestId("sign-in-banner")).toHaveText(
    "You are signed out."
  );
});

test("the idle warning appears before the server expiry and Stay signed in keeps the session (R-33)", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await page.goto("/account");

  const token = await sessionToken(context);
  const before = await lastActiveAt(token);

  const [idleMinutes] = await queryDatabase(
    "select session_idle_minutes from tenant_settings"
  );

  await page.clock.fastForward(Number(idleMinutes) * 60_000 - 120_000 + 1000);

  const warning = page.getByRole("dialog", { name: "Still there?" });

  await expect(warning).toBeVisible();
  await expectNoAxeViolations(page, "idle warning");

  // Escape does nothing: only the two buttons act.
  await page.keyboard.press("Escape");
  await expect(warning).toBeVisible();

  const [activity] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/session/activity") &&
        response.request().method() === "POST"
    ),
    warning.getByRole("button", { name: "Stay signed in" }).click(),
  ]);

  expect(activity.status()).toBe(200);
  await expect(warning).toHaveCount(0);
  expect(await lastActiveAt(token)).toBeGreaterThan(before);
});

test("the identity block shows the square mark only for a clean or skipped file (R-39, R-49, D3-7)", async ({
  page,
  browser,
}, testInfo) => {
  // The mark sits in the aside's identity block from `lg`, in the top bar below it.
  const scope = atLg(page)
    ? page
        .getByRole("complementary", { name: "Navigation" })
        .locator("[data-shell-identity]")
    : page.locator("[data-shell-top-bar]");

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        await seedBrandingMark(browser, testInfo.project.name);

        await expect
          .poll(async () => {
            await page.goto("/account");

            const image = scope.locator("img");

            if ((await image.count()) !== 1) return "no image";

            return image.evaluate((node: HTMLImageElement) =>
              node.complete &&
              node.naturalWidth > 0 &&
              node.src.includes("/api/files/download?token=")
                ? "loaded"
                : `not loaded: ${node.src}`
            );
          }, POLL)
          .toBe("loaded");

        // A pending file is not served, so the shell falls back to the Ops Center icon (DR-19).
        await queryDatabase(
          "update file set scan_status = 'pending' where id = (select logo_mark_file_id from tenant_branding)"
        );

        await expect
          .poll(async () => {
            await page.goto("/account");

            return scope.locator("img").getAttribute("src");
          }, POLL)
          .toBe("/brand/icon-blue.svg");
      } finally {
        await clearBrandingMark();
      }
    },
    LOCK_WAIT_MS
  );
});

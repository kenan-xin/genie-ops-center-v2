import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import {
  INVITE_DB,
  inviteBaseUrl,
  LANDING_DB,
  landingBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { atLg, openNavigation } from "./support/shell.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Spec 3 S3-09: the Section 3 acceptance proofs that no page ticket owns. AC-9 and AC-17 (axe on
 * every Section 3 screen in both themes), AC-9 and AC-16 (the keyboard walk), R-70 and AC-18
 * (reduced motion), and AC-11b (first enable), at the phone and the desktop viewport (DEC-25).
 *
 * They run on the invite deployment, as the page proofs of S3-05 and S3-06 do, with their own
 * administrator. The invite branding keeps the theme `system`, so the emulated color scheme picks
 * the theme. AC-11b runs on the landing deployment instead, because only the fixture image compiles
 * the module with a required value and no default. It restores that module's row before it lets
 * go of the row's lock.
 */
const BASE = inviteBaseUrl();

const LOCK_WAIT_MS = 300_000;

/** `modules-categories.spec.ts` counts whole-table category audit rows under this lock. */
const CATEGORIES_LOCK = "s2-16-entitlement";

const POLL = { timeout: 30_000, intervals: [1000] };

const SAVED = "Saved. Written to the audit log.";

test.describe.configure({ timeout: 420_000 });

/** The shell and every Section 3 screen, each with the text that shows once its read answered. */
const SCREENS = [
  { name: "shell", path: "/", ready: null },
  { name: "Modules", path: "/admin/modules", ready: "Modules" },
  { name: "Categories", path: "/admin/categories", ready: "Categories" },
  {
    name: "Tenant settings",
    path: "/admin/settings",
    ready: "Tenant settings",
  },
  { name: "Branding", path: "/admin/branding", ready: "Branding" },
] as const;

async function sql(query: string): Promise<string> {
  const [first] = await queryBrokerDatabase(INVITE_DB, query);

  return first ?? "";
}

async function signIn(page: Page, project: string): Promise<void> {
  await signInThroughBroker(page, {
    baseUrl: BASE,
    email: scenarioEmail("invite", "acceptance", project),
  });
}

async function openScreen(
  page: Page,
  screen: (typeof SCREENS)[number]
): Promise<void> {
  await page.goto(`${BASE}${screen.path}`);

  if (screen.ready === null) await expect(page.locator("main")).toBeVisible();
  else
    await expect(
      page.getByRole("heading", { level: 1, name: screen.ready, exact: true })
    ).toBeVisible();

  await expect(page.getByText(/^Loading/)).toHaveCount(0);
}

test("axe finds no violation on the shell, the sign-in page and every Section 3 screen, light and dark (AC-9, AC-17)", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, testInfo.project.name);

  for (const theme of ["light", "dark"] as const) {
    // oxlint-disable no-await-in-loop -- one theme, then one screen, at a time in one page.
    await page.emulateMedia({ colorScheme: theme });

    for (const screen of SCREENS) {
      await openScreen(page, screen);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoAxeViolations(page, `${screen.name} ${theme}`);
    }

    // The navigation: the aside from lg, the drawer below it.
    await openScreen(page, SCREENS[0]);
    await openNavigation(page);
    await expectNoAxeViolations(page, `navigation ${theme}`);

    const signedOut = await browser.newContext({ colorScheme: theme });

    try {
      const visitor = await signedOut.newPage();

      await visitor.goto(`${BASE}/sign-in`);
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-theme",
        theme
      );
      await expectNoAxeViolations(visitor, `sign-in ${theme}`);
    } finally {
      await signedOut.close();
    }
    // oxlint-enable no-await-in-loop
  }
});

/** One Tab press: where focus landed, and whether it shows the --ring color as a ring or an outline. */
type Step = {
  readonly walk: number | null;
  readonly ring: boolean;
  readonly name: string;
};

/**
 * Tabs from the top of a freshly loaded screen until focus leaves the page. Every visible tabbable
 * element is numbered in document order first, so the walk must reach each once, in that order.
 */
async function keyboardWalk(
  page: Page
): Promise<{ expected: number; steps: Step[] }> {
  const expected = await page.evaluate(() => {
    const tabbable = [
      ...document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]"
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        element.closest("[inert], [aria-hidden='true']") === null &&
        element.checkVisibility({ visibilityProperty: true }) &&
        !(element instanceof HTMLInputElement && element.type === "hidden")
    );

    for (const [index, element] of tabbable.entries())
      element.setAttribute("data-walk", String(index));

    return tabbable.length;
  });

  const steps: Step[] = [];

  for (let press = 0; press <= expected; press++) {
    // oxlint-disable-next-line no-await-in-loop -- each press moves on from the previous one.
    await page.keyboard.press("Tab");

    // oxlint-disable-next-line no-await-in-loop -- as above.
    const step = await page.evaluate((): Step | undefined => {
      const element = document.activeElement;

      if (!(element instanceof HTMLElement) || element === document.body)
        return undefined;

      // A field inside an Input Group draws its ring on the group box around it (the shadcn part).
      const ringBox =
        element.closest<HTMLElement>('[data-slot="input-group"]') ?? element;

      const style = getComputedStyle(ringBox);

      // R-8: the focus ring is the --ring color, resolved as rgb() in this element's theme.
      const probe = document.createElement("span");

      probe.style.color = style.getPropertyValue("--ring");
      element.after(probe);

      const ring = getComputedStyle(probe).color;

      probe.remove();

      return {
        walk: element.hasAttribute("data-walk")
          ? Number(element.getAttribute("data-walk"))
          : null,
        ring:
          style.boxShadow.includes(ring) ||
          (style.outlineStyle !== "none" &&
            style.outlineWidth !== "0px" &&
            style.outlineColor === ring),
        name:
          element.getAttribute("aria-label") ??
          (element.textContent?.trim().slice(0, 40) || element.tagName),
      };
    });

    if (step === undefined) break;

    steps.push(step);
  }

  return { expected, steps };
}

test("a keyboard walk reaches every control of the shell and each Section 3 screen in reading order, each with the focus ring (AC-9, AC-16, R-67, R-8)", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo.project.name);

  for (const screen of SCREENS) {
    // oxlint-disable no-await-in-loop -- one screen at a time in one page.
    await openScreen(page, screen);

    const { expected, steps } = await keyboardWalk(page);

    expect(expected, `${screen.name} has controls`).toBeGreaterThan(0);
    expect(
      steps.map((step) => step.walk ?? step.name),
      `${screen.name} focus order`
    ).toEqual(Array.from({ length: expected }, (_, index) => index));
    expect(
      steps.filter((step) => !step.ring).map((step) => step.name),
      `${screen.name} controls without a focus ring`
    ).toEqual([]);
    // oxlint-enable no-await-in-loop
  }
});

declare global {
  interface Window {
    /** What `recordMotion` saw start since the last `takeMotion`. */
    motionSeen: string[];
  }
}

/** Records every transition and animation the page starts, from before its first script. */
async function recordMotion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];

    window.motionSeen = seen;

    for (const type of ["transitionrun", "animationstart"] as const) {
      window.addEventListener(
        type,
        (event) => {
          const target = event.target instanceof Element ? event.target : null;

          const what =
            event instanceof TransitionEvent
              ? event.propertyName
              : event instanceof AnimationEvent
                ? event.animationName
                : "";

          seen.push(
            `${type} ${what} on ${target?.tagName.toLowerCase() ?? "?"}.${target?.className ?? ""}`.slice(
              0,
              160
            )
          );
        },
        true
      );
    }
  });
}

/** The motion recorded so far, plus every animation still running, then a clean slate. */
async function takeMotion(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const running = document
      .getAnimations()
      .map((animation) => `running ${animation.constructor.name}`);

    const taken = [...window.motionSeen, ...running];

    window.motionSeen.length = 0;

    return taken;
  });
}

test("under prefers-reduced-motion no transition or animation runs on the shell, the drawer, the dialog and the toast (R-70, AC-18, R-7)", async ({
  page,
}, testInfo) => {
  const name = `S3-09 motion ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;

  await recordMotion(page);
  await signIn(page, testInfo.project.name);

  const deleteDialog = page.getByRole("dialog", { name: `Delete ${name}?` });

  const openDelete = async () => {
    await page
      .getByRole("button", { name: `Delete ${name}`, exact: true })
      .click();
    await expect(deleteDialog).toBeVisible();
  };

  await withDeploymentLock(
    CATEGORIES_LOCK,
    async () => {
      try {
        await page.goto(`${BASE}/admin/categories`);
        await page.getByLabel("New category name").fill(name);
        await page.getByRole("button", { name: "Add", exact: true }).click();
        await expect(
          page.getByRole("listitem", { name, exact: true })
        ).toBeVisible();
        // The row shows before the write settles, and its loading Delete button drops a click.
        await expect(page.getByText(SAVED).first()).toBeVisible();

        // The control: with no preference the same dialog moves, so the recorder can see motion.
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await takeMotion(page);
        await openDelete();
        await expect
          .poll(async () => (await takeMotion(page)).length)
          .toBeGreaterThan(0);
        await deleteDialog.getByRole("button", { name: "Cancel" }).click();
        await expect(deleteDialog).toHaveCount(0);

        await page.emulateMedia({ reducedMotion: "reduce" });
        // Let the control's exit finish before the slate is cleaned.
        await expect
          .poll(() => page.evaluate(() => document.getAnimations().length))
          .toBe(0);
        await takeMotion(page);

        // The shell: a page load and a hover over a navigation row.
        await page.goto(`${BASE}/admin/categories`);

        const navigation = await openNavigation(page);

        if (atLg(page)) await navigation.getByRole("link").first().hover();

        expect(
          await takeMotion(page),
          atLg(page) ? "shell" : "shell and drawer"
        ).toEqual([]);

        if (!atLg(page)) {
          await page.keyboard.press("Escape");
          await expect(navigation).toBeHidden();
          expect(await takeMotion(page), "drawer close").toEqual([]);
        }

        // The dialog, and the toast its confirm raises.
        await openDelete();
        expect(await takeMotion(page), "dialog").toEqual([]);
        await deleteDialog
          .getByRole("button", { name: "Delete", exact: true })
          .click();
        await expect(deleteDialog).toHaveCount(0);
        await expect(page.getByText(SAVED).first()).toBeVisible();
        expect(await takeMotion(page), "dialog close and toast").toEqual([]);
      } finally {
        await sql(`delete from category where name = '${name}'`);
      }
    },
    LOCK_WAIT_MS
  );
});

/** The fixture module whose required `endpoint` has no default. Only the fixture image compiles it. */
const REQUIRED = "required-setting";

/** AC-11b writes the fixture's row, so the phone and the desktop runs take turns on it. */
const REQUIRED_LOCK = "s3-09-required-setting";

const LANDING = landingBaseUrl();

async function landingSql(query: string): Promise<string> {
  const [first] = await queryBrokerDatabase(LANDING_DB, query);

  return first ?? "";
}

const requiredRow = () =>
  landingSql(
    `select enabled::text || ' ' || config::text from tenant_module where module_id = '${REQUIRED}'`
  );

const enabledCount = () =>
  landingSql(
    `select count(*) from audit_event where action = 'core:module_enabled' and target_id = '${REQUIRED}'`
  ).then(Number);

/** Every assignment of a role that carries the fixture's key: the access the attempts must keep. */
const requiredAssignments = () =>
  landingSql(
    `select coalesce(string_agg(a.role_id || ':' || a.principal_type || ':' || a.principal_id, ',' order by a.role_id, a.principal_id), '')
       from role_assignment a join role r on r.id = a.role_id
      where r.permissions && array['${REQUIRED}:use']`
  );

test("first enable: a required value refuses the switch, a settings save keeps the module off, then the enable succeeds (AC-11b, R-84a)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    REQUIRED_LOCK,
    async () => {
      const wasEnabled = await landingSql(
        `select enabled::text from tenant_module where module_id = '${REQUIRED}'`
      );

      const wasConfig = await landingSql(
        `select config::text from tenant_module where module_id = '${REQUIRED}'`
      );

      try {
        // The module arrives off, with its required endpoint never set.
        await landingSql(
          `update tenant_module set enabled = false, config = '{}'::jsonb where module_id = '${REQUIRED}'`
        );

        const access = await requiredAssignments();
        const before = await enabledCount();

        await signInThroughBroker(page, {
          baseUrl: LANDING,
          email: scenarioEmail("landing", "acceptance", testInfo.project.name),
        });
        await page.goto(`${LANDING}/admin/modules`);

        const toggle = page
          .getByRole("switch", { name: "Required setting fixture on" })
          .filter({ visible: true });

        await expect(toggle).not.toBeChecked();
        await toggle.click();

        // The refusal names the field and points at the core configuration path.
        const refusal = page
          .getByRole("alert")
          .filter({ hasText: "endpoint" })
          .filter({ visible: true });

        await expect(refusal).toBeVisible();
        await expect(
          refusal.getByText("endpoint", { exact: true })
        ).toBeVisible();
        await expect(toggle).not.toBeChecked();
        await expectNoAxeViolations(page, "first enable refused");
        expect(await requiredRow()).toBe("false {}");
        expect(await enabledCount()).toBe(before);

        // Saving the value through Tenant Settings is not activation.
        await refusal.getByRole("link", { name: "Fix in settings" }).click();
        await expect(page).toHaveURL(/\/admin\/settings/);

        const back = page.getByRole("button", { name: "All settings" });

        if (await back.isVisible()) await back.click();

        await page
          .getByRole("navigation", { name: "Settings sections" })
          .getByRole("button", { name: /^Required setting fixture( |$)/ })
          .click();
        await page
          .getByRole("textbox", { name: "Endpoint" })
          .fill("First enable");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect(
          page
            .getByText(
              "Required setting fixture saved. Written to the audit log."
            )
            .first()
        ).toBeVisible();

        expect(await requiredRow()).toBe('false {"endpoint": "First enable"}');
        expect(await enabledCount()).toBe(before);

        // Enabling now succeeds, and the settings and the access are what they were.
        await page.goto(`${LANDING}/admin/modules`);
        await toggle.click();
        await expect(toggle).toBeChecked();
        await expect(page.getByText(SAVED)).toBeVisible();
        await expect.poll(enabledCount, POLL).toBe(before + 1);
        expect(await requiredRow()).toBe('true {"endpoint": "First enable"}');
        expect(await requiredAssignments()).toBe(access);
      } finally {
        await landingSql(
          `update tenant_module set enabled = ${wasEnabled}, config = '${wasConfig.replaceAll("'", "''")}'::jsonb where module_id = '${REQUIRED}'`
        );
      }
    },
    LOCK_WAIT_MS
  );
});

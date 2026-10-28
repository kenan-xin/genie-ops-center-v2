import { expect, test, type Page } from "@playwright/test";

import {
  e2eBrandingAdminEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { publishBranding } from "./support/branding-page.ts";
import { queryDatabase } from "./support/database.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { rpcPost } from "./support/rpc.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * Spec 3 S3-07: the Branding page (AC-5, AC-13 with the AC-15 part, AC-17, and the branding part
 * of AC-19a), at the phone and the desktop viewport (DEC-25).
 *
 * The branding row is one row that every branding proof shares, so each test holds the `branding`
 * lock that `sign-in-email-branding.spec.ts` takes, and puts the seed values back before it lets
 * go. The page reads the row fresh; the shell reads it through the 10-second reader (DEC-46), so
 * the shell check polls a reload, never a fixed sleep.
 */
test.describe.configure({ timeout: 300_000 });

const LOCK_WAIT_MS = 300_000;

const POLL = { timeout: 30_000, intervals: [1000] };

const SEED_RESET = `update tenant_branding set company_name = 'E2E Group', product_name = 'E2E Ops',
  primary_color = null, primary_foreground = null, default_theme = 'system',
  logo_light_file_id = null, logo_dark_file_id = null, logo_mark_file_id = null, favicon_file_id = null,
  login_welcome_text = null, login_background_color = null, login_notice_text = null,
  login_notice_requires_acknowledgement = false`;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",
  "base64"
);

const ONE_MB = 1_048_576;

async function sql(query: string): Promise<string> {
  const [first] = await queryDatabase(query);

  return first ?? "";
}

const publishedCount = () =>
  sql(
    "select count(*) from audit_event where action = 'core:branding_published'"
  ).then(Number);

/** Deletes this project's uploaded files after the row no longer names them. */
async function cleanUp(prefix: string): Promise<void> {
  await queryDatabase(SEED_RESET);
  await queryDatabase(
    `delete from file_blob where id in (select id from file where file_name like '${prefix}%');
     delete from file where file_name like '${prefix}%'`
  );
}

async function openBranding(page: Page, project: string): Promise<void> {
  await signInThroughKeycloak(page, { email: e2eBrandingAdminEmail(project) });
  await page.goto("/admin/branding");
  await expect(page.getByRole("textbox", { name: "Company name" })).toHaveValue(
    "E2E Group"
  );
}

const rootPrimary = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim()
  );

test("edits each tab, publishes once, writes one core:branding_published row, and the shell follows light and dark without a reload (AC-5, AC-13, AC-15, NAV-1)", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        await queryDatabase(SEED_RESET);
        await openBranding(page, project);
        await expectNoAxeViolations(page, "branding identity");

        for (const [theme, color] of [
          ["light", "#0f766e"],
          ["dark", "#1d4ed8"],
        ] as const) {
          // oxlint-disable no-await-in-loop -- one theme at a time, under one lock.
          const origin = await page.evaluate(() => performance.timeOrigin);
          const companyName = `Branded ${theme} ${project}`;
          const before = await publishedCount();

          await page.getByRole("tab", { name: "Identity" }).click();
          await page
            .getByRole("textbox", { name: "Company name" })
            .fill(companyName);
          await page.getByRole("tab", { name: "Colors" }).click();
          await page
            .getByRole("textbox", { name: "Primary color", exact: true })
            .fill(color);
          await page
            .getByRole("radio", { name: theme === "light" ? "Light" : "Dark" })
            .check();
          await expect(
            page
              .getByRole("list", { name: "Contrast checks" })
              .getByText("Pass")
          ).toHaveCount(4);
          await page.getByRole("tab", { name: "Sign-in" }).click();
          await page
            .getByRole("textbox", { name: "Welcome text" })
            .fill(`Welcome ${theme}`);
          await expect(page.getByText("4 unpublished changes")).toBeVisible();

          // AC-5: the preview shows the draft before Publish; phones open it with Show preview.
          if (testInfo.project.name === "phone")
            await page.getByRole("button", { name: "Show preview" }).click();

          const preview = page.getByRole("group", { name: "Preview" });

          // The preview draws the page's stack: the company name names the default mark.
          await expect(
            preview.getByRole("img", { name: companyName })
          ).toBeVisible();
          await expect(preview.getByText(`Welcome ${theme}`)).toBeVisible();
          await expect(
            preview.getByText("Sign in with SSO", { exact: true })
          ).toHaveCSS(
            "background-color",
            `rgb(${[1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16)).join(", ")})`
          );
          await expectNoAxeViolations(page, `branding draft ${theme}`);

          await publishBranding(page);

          expect(await publishedCount()).toBe(before + 1);
          expect(
            await sql(
              `select metadata->'changedFields' from audit_event where action = 'core:branding_published' order by occurred_at desc limit 1`
            )
          ).toBe(
            '["companyName", "primaryColor", "defaultTheme", "loginWelcomeText"]'
          );
          expect(
            await sql(
              "select company_name || ' ' || primary_color || ' ' || primary_foreground || ' ' || default_theme || ' ' || login_welcome_text from tenant_branding"
            )
          ).toBe(`${companyName} ${color} #ffffff ${theme} Welcome ${theme}`);

          // NAV-1: no client navigation renders the root layout again, so the route refreshes it after
          // Publish, and again after the 10-second reader window (DEC-46). Nothing reloads here.
          await expect
            .poll(
              async () =>
                `${await rootPrimary(page)} ${await page.locator("html").getAttribute("data-theme")}`,
              POLL
            )
            .toBe(`${color} ${theme}`);
          expect(await page.evaluate(() => performance.timeOrigin)).toBe(
            origin
          );

          // AC-13 and AC-15: the shell takes the new color, theme and company name within the reader
          // window. The poll waits for the navigation name too, the state the next assertion reads.
          await expect
            .poll(async () => {
              await page.goto("/");

              const navigation = await openNavigation(page);
              const named = await navigation.getByText(companyName).isVisible();

              return `${await rootPrimary(page)} ${await page.locator("html").getAttribute("data-theme")} ${named}`;
            }, POLL)
            .toBe(`${color} ${theme} true`);
          await expect(
            (await openNavigation(page)).getByText(companyName)
          ).toBeVisible();
          await expectNoAxeViolations(page, `shell after publish ${theme}`);

          await page.goto("/admin/branding");
          await expect(
            page.getByRole("textbox", { name: "Company name" })
          ).toHaveValue(companyName);
          // oxlint-enable no-await-in-loop
        }
      } finally {
        await queryDatabase(SEED_RESET);
      }
    },
    LOCK_WAIT_MS
  );
});

test("a pair below 3:1 blocks Publish and a text pair under 4.5:1 only warns (AC-5, AC-17)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "branding",
    async () => {
      await queryDatabase(SEED_RESET);
      await openBranding(page, testInfo.project.name);

      const pills = page.getByRole("list", { name: "Contrast checks" });

      const pill = (name: string) =>
        pills.getByRole("listitem").filter({ hasText: name });

      const publish = page.getByRole("button", {
        name: "Publish",
        exact: true,
      });

      // DR-05: the fifth pair checks the sign-in text on the sign-in background.
      await page.getByRole("tab", { name: "Sign-in" }).click();

      const background = page.getByRole("textbox", {
        name: "Background color",
        exact: true,
      });

      await background.fill("#22aaee");
      await expect(pill("Sign-in text")).toContainText("Fail");
      await expect(publish).toHaveAttribute("aria-disabled", "true");
      await background.fill("");

      await page.getByRole("tab", { name: "Colors" }).click();
      await expectNoAxeViolations(page, "branding colors");

      const primary = page.getByRole("textbox", {
        name: "Primary color",
        exact: true,
      });

      // Between 3:1 and 4.5:1 a text pair warns and Publish stays open; the ring passes at 3:1.
      await primary.fill("#ec4899");
      await expect(pill("Fill")).toContainText("Warning");
      await expect(pill("Text on nav")).toContainText("Warning");
      await expect(pill("Count pill")).toContainText("Warning");
      await expect(pill("Focus ring")).toContainText("Pass");
      await expect(publish).not.toHaveAttribute("aria-disabled", "true");

      // Below 3:1 every pair fails and blocks Publish, and no pill offers a fix.
      await primary.fill("#ca8a04");
      await expect(pills.getByText("Fail")).toHaveCount(4);
      await expect(publish).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("button", { name: "Fix" })).toHaveCount(0);
      expect(
        await sql(
          "select coalesce(primary_color, 'none') || ' ' || coalesce(login_background_color, 'none') from tenant_branding"
        )
      ).toBe("none none");
    },
    LOCK_WAIT_MS
  );
});

test("png, svg, webp and ico uploads are stored with scan_status skipped, the svg is cleaned, the mark shows in the preview, and the size and type limits hold (AC-5)", async ({
  page,
}, testInfo) => {
  const prefix = `e2e-branding-${testInfo.project.name}-`;

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        await queryDatabase(SEED_RESET);
        await openBranding(page, testInfo.project.name);

        const uploads = [
          ["Square mark", `${prefix}mark.png`, "image/png", PNG],
          [
            "Logo for light backgrounds",
            `${prefix}logo.svg`,
            "image/svg+xml",
            Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="4" height="4"/></svg>'
            ),
          ],
          [
            "Logo for dark backgrounds",
            `${prefix}logo.webp`,
            "image/webp",
            Buffer.from("RIFF\0\0\0\0WEBP"),
          ],
          [
            "Favicon",
            `${prefix}favicon.ico`,
            "image/x-icon",
            Buffer.from([0, 0, 1, 0]),
          ],
        ] as const;

        for (const [slot, name, mimeType, buffer] of uploads) {
          // oxlint-disable no-await-in-loop -- each upload is its own request into its own slot.
          await page
            .getByLabel(`Upload a file for ${slot}`)
            .setInputFiles({ name, mimeType, buffer });
          await expect(
            page
              .getByRole("group", { name: slot })
              .getByText(name, { exact: true })
          ).toBeVisible();
          await expect(
            page.getByRole("group", { name: slot }).getByText("Skipped")
          ).toBeVisible();
          // oxlint-enable no-await-in-loop
        }

        expect(
          await sql(
            `select string_agg(scan_status, ',') from file where file_name like '${prefix}%'`
          )
        ).toBe("skipped,skipped,skipped,skipped");
        expect(
          await sql(
            `select convert_from(b.bytes, 'UTF8') ~* '(script|onload)' from file f join file_blob b on b.id = f.id where f.file_name = '${prefix}logo.svg'`
          )
        ).toBe("f");

        // The preview loads the mark through its signed download link (D3-7).
        if (!(await page.getByRole("group", { name: "Preview" }).isVisible()))
          await page.getByRole("button", { name: "Show preview" }).click();

        const mark = page
          .getByRole("group", { name: "Preview" })
          .locator("img");

        await expect(mark).toHaveAttribute(
          "src",
          /\/api\/files\/download\?token=/
        );
        await expect
          .poll(
            () =>
              mark.evaluate((image: HTMLImageElement) => image.naturalWidth),
            POLL
          )
          .toBe(1);
        await expect(page.getByText("4 unpublished changes")).toBeVisible();
        await expectNoAxeViolations(page, "branding uploads");

        const light = page.getByLabel(
          "Upload a file for Logo for light backgrounds"
        );

        const lightSlot = page.getByRole("group", {
          name: "Logo for light backgrounds",
        });

        await light.setInputFiles({
          name: `${prefix}exact.png`,
          mimeType: "image/png",
          buffer: Buffer.alloc(ONE_MB),
        });
        await expect(
          lightSlot.getByText(`${prefix}exact.png`, { exact: true })
        ).toBeVisible();

        await light.setInputFiles({
          name: `${prefix}big.png`,
          mimeType: "image/png",
          buffer: Buffer.alloc(ONE_MB + 1),
        });
        await expect(
          lightSlot.getByText("This file is over 1 MB.")
        ).toBeVisible();

        await light.setInputFiles({
          name: `${prefix}report.pdf`,
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.7"),
        });
        await expect(
          lightSlot.getByText("Use a PNG, SVG, WebP or ICO file.")
        ).toBeVisible();
        expect(
          await sql(
            `select count(*) from file where file_name in ('${prefix}big.png', '${prefix}report.pdf')`
          )
        ).toBe("0");

        // Discard, so the page leaves without the browser's unload prompt.
        await page
          .getByRole("button", { name: "Discard", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Discard", exact: true })
          .click();
        await expect(page.getByText(/unpublished change/)).toHaveCount(0);
      } finally {
        await cleanUp(prefix);
      }
    },
    LOCK_WAIT_MS
  );
});

test("a file dropped on an empty image slot shows the drop state, then uploads (tokens.md, Drop zone)", async ({
  page,
}, testInfo) => {
  const prefix = `e2e-drop-${testInfo.project.name}-`;

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        await queryDatabase(SEED_RESET);
        await openBranding(page, testInfo.project.name);

        const slot = page.getByRole("group", { name: "Square mark" });
        const zone = slot.locator("[data-drop-zone]");

        // The browser's own drag carries a DataTransfer with the file, as a desktop drag does.
        const dataTransfer = await page.evaluateHandle(
          ([name, base64]) => {
            const bytes = Uint8Array.from(atob(base64), (char) =>
              char.charCodeAt(0)
            );

            const transfer = new DataTransfer();

            transfer.items.add(new File([bytes], name, { type: "image/png" }));

            return transfer;
          },
          [`${prefix}mark.png`, PNG.toString("base64")] as const
        );

        await zone.dispatchEvent("dragenter", { dataTransfer });
        await expect(zone).toContainText("Drop to upload");
        await zone.dispatchEvent("drop", { dataTransfer });

        await expect(
          slot.getByText(`${prefix}mark.png`, { exact: true })
        ).toBeVisible();
        await expect(slot.getByText("Skipped")).toBeVisible();
      } finally {
        await cleanUp(prefix);
      }
    },
    LOCK_WAIT_MS
  );
});

test("a person without core:branding:manage sees no Branding entry and the route refuses (AC-19a, R-93)", async ({
  page,
}, testInfo) => {
  // The reader also signs in for the email-branding proof, so the sign-in waits for its lock.
  await withDeploymentLock(
    "branding",
    async () => {
      await signInThroughKeycloak(page, {
        email: e2eReaderEmail("branding", testInfo.project.name),
      });
      await page.goto("/admin/audit");
      await expect(
        (await openNavigation(page)).getByRole("link", {
          name: "Branding",
          exact: true,
        })
      ).toHaveCount(0);

      await page.goto("/admin/branding");
      await expect(page.getByTestId("permission-denied")).toBeVisible();

      const read = await rpcPost(page.request, "/api/rpc/branding/read");

      expect(read.status()).toBe(403);
      expect(await read.text()).toContain('"appCode":"forbidden"');
    },
    LOCK_WAIT_MS
  );
});

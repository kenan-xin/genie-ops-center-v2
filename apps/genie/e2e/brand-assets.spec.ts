import { expect, test, type Page } from "@playwright/test";

import { e2eBrandingAdminEmail } from "../testing/e2e-keycloak.ts";
import { publishBranding } from "./support/branding-page.ts";
import { queryDatabase } from "./support/database.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * DR-03: the tab icon and the shell identity block show the published favicon and the logo of the
 * active theme, else the Ops Center defaults from `public/brand/`, at the phone and the desktop
 * viewport (DEC-25). The organization theme stays `system`, so the emulated device scheme picks
 * light or dark. The branding row is shared, so each test holds the `branding` lock and clears the
 * image columns before it lets go; the shell reads through the 10-second reader (DEC-46), so every
 * read after a publish polls.
 */
test.describe.configure({ timeout: 300_000 });

const LOCK_WAIT_MS = 300_000;

const POLL = { timeout: 60_000, intervals: [1000] };

const LINK = /(?:https?:\/\/[^/ ]+)?\/api\/files\/download\?token=[^ ]+/g;

const CLEAR_IMAGES =
  "update tenant_branding set logo_light_file_id = null, logo_dark_file_id = null, logo_mark_file_id = null, favicon_file_id = null";

/** An SVG logo whose width tells the light logo from the dark one in the browser. */
const logo = (width: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="8"><rect width="${width}" height="8"/></svg>`
  );

const FAVICON = Buffer.from([0, 0, 1, 0]);

async function cleanUp(prefix: string): Promise<void> {
  await queryDatabase(CLEAR_IMAGES);
  await queryDatabase(
    `delete from file_blob where id in (select id from file where file_name like '${prefix}%');
     delete from file where file_name like '${prefix}%'`
  );
}

const tabIconHref = (page: Page) =>
  page.locator('head link[rel="icon"]').first().getAttribute("href");

/**
 * Reloads a shell page and answers "<tab icon> | <shown identity image> <natural width>", with each
 * branding link written as `<link>`. One image only must show: the other theme's row is hidden.
 */
async function shownBrand(page: Page): Promise<string> {
  await page.goto("/account");

  const icon = await tabIconHref(page);

  const image = (await openNavigation(page)).locator(
    "[data-shell-identity] img:visible"
  );

  if ((await image.count()) !== 1) return `${await image.count()} images shown`;

  const shown = await image.evaluate((node: HTMLImageElement) =>
    node.complete && node.naturalWidth > 0
      ? `${node.getAttribute("src")} ${node.naturalWidth}`
      : "not loaded"
  );

  return `${icon} | ${shown}`.replaceAll(LINK, "<link>");
}

async function expectTabIcon(page: Page, body: Buffer | null): Promise<void> {
  const response = await page.request.get((await tabIconHref(page)) ?? "");

  expect(response.status()).toBe(200);

  if (body !== null) expect(await response.body()).toEqual(body);
}

test("a published favicon and both logos reach the tab and the shell, light and dark (DR-03)", async ({
  page,
}, testInfo) => {
  const prefix = `e2e-brand-assets-${testInfo.project.name}-`;

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        await cleanUp(prefix);
        await signInThroughKeycloak(page, {
          email: e2eBrandingAdminEmail(testInfo.project.name),
        });
        await page.goto("/admin/branding");

        const uploads = [
          [
            "Logo for light backgrounds",
            `${prefix}light.svg`,
            "image/svg+xml",
            logo(40),
          ],
          [
            "Logo for dark backgrounds",
            `${prefix}dark.svg`,
            "image/svg+xml",
            logo(60),
          ],
          ["Favicon", `${prefix}favicon.ico`, "image/x-icon", FAVICON],
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
          // oxlint-enable no-await-in-loop
        }

        await publishBranding(page);

        await page.emulateMedia({ colorScheme: "light" });
        await expect
          .poll(() => shownBrand(page), POLL)
          .toBe("<link> | <link> 40");
        await expectTabIcon(page, FAVICON);

        await page.emulateMedia({ colorScheme: "dark" });
        await expect
          .poll(() => shownBrand(page), POLL)
          .toBe("<link> | <link> 60");
        await expectTabIcon(page, FAVICON);
      } finally {
        await cleanUp(prefix);
      }
    },
    LOCK_WAIT_MS
  );
});

test("with no published branding the tab and the shell show the Ops Center defaults (DR-03, DR-19)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "branding",
    async () => {
      await queryDatabase(CLEAR_IMAGES);
      await signInThroughKeycloak(page, {
        email: e2eBrandingAdminEmail(testInfo.project.name),
      });

      for (const colorScheme of ["light", "dark"] as const) {
        // oxlint-disable no-await-in-loop -- one theme at a time, under one lock.
        await page.emulateMedia({ colorScheme });
        await expect
          .poll(() => shownBrand(page), POLL)
          .toBe("/brand/favicon.ico | /brand/icon-blue.svg 128");
        await expectTabIcon(page, null);
        // oxlint-enable no-await-in-loop
      }
    },
    LOCK_WAIT_MS
  );
});

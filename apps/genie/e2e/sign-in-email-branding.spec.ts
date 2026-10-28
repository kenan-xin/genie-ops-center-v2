import { expect, test, type Page } from "@playwright/test";

import {
  e2eBrandingAdminEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { publishBranding } from "./support/branding-page.ts";
import { queryDatabase } from "./support/database.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { clearMailpit, linksIn, waitForMessageTo } from "./support/mailpit.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * Spec 3 AC-6, AC-12, AC-14 and AC-15: a branding change reaches the sign-in page and a rendered
 * email as text and color, once with the tenant default theme light and once dark. The change is
 * published through the Branding page (S3-09 rerun). The page edits no email field yet, so the
 * sender, reply-to, footer, support and legal values are written to `tenant_branding` directly.
 * The 10-second reader cache (DEC-46) is waited out by polling, never by a fixed sleep.
 *
 * The branding row is one row that both projects share, so each project holds a lock while it
 * writes and reads it, and puts the seed values back before it lets go.
 */
test.describe.configure({ timeout: 300_000 });

/** The other project can hold the lock for its whole test, so the wait matches the test timeout. */
const LOCK_WAIT_MS = 300_000;

const SEED_RESET = `update tenant_branding set company_name = 'E2E Group', product_name = 'E2E Ops',
  primary_color = null, primary_foreground = null, default_theme = 'system',
  login_welcome_text = null, login_background_color = null, email_sender_name = null, email_reply_to = null,
  email_footer_text = null, support_email = null, terms_url = null, privacy_url = null`;

/**
 * Polls the signed-out sign-in page until the reader cache serves the written company name, which
 * the page shows as the text of its mark.
 */
async function openBrandedSignIn(
  page: Page,
  companyName: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.goto("/sign-in");

        return page.locator("main img").getAttribute("alt");
      },
      { timeout: 30_000, intervals: [1000] }
    )
    .toBe(companyName);
}

test("an empty welcome text shows no welcome line on the sign-in page (DR-04)", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const companyName = `Default welcome ${project} Co`;

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        await queryDatabase(
          `update tenant_branding set company_name = '${companyName}', product_name = 'Default Ops',
           login_welcome_text = null`
        );
        await openBrandedSignIn(page, companyName);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Sign in to Default Ops",
          })
        ).toBeVisible();
        await expect(page.getByTestId("sign-in-welcome")).toHaveCount(0);

        await signInThroughKeycloak(page, {
          email: e2eBrandingAdminEmail(project),
        });
        await page.goto("/admin/branding");
        await expect(
          page.getByRole("textbox", { name: "Company name" })
        ).toHaveValue(companyName);
        await page.getByRole("tab", { name: "Sign-in" }).click();

        // On a phone the preview sits behind its toggle (R-53).
        const toggle = page.getByRole("button", { name: "Show preview" });

        if (await toggle.isVisible()) await toggle.click();

        const preview = page.getByRole("group", { name: "Preview" });

        await expect(
          preview.getByText("Sign in to Default Ops", { exact: true })
        ).toBeVisible();
        await expect(preview.getByTestId("sign-in-welcome")).toHaveCount(0);
      } finally {
        await queryDatabase(SEED_RESET);
      }
    },
    LOCK_WAIT_MS
  );
});

test("a branding change reaches the sign-in page and the email, light and dark", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const project = testInfo.project.name;
  const publicUrl = new URL(baseURL ?? "").origin;

  await withDeploymentLock(
    "branding",
    async () => {
      try {
        for (const theme of ["light", "dark"] as const) {
          const companyName = `Branded ${theme} Co`;
          const footer = `Branded footer ${theme}`;
          const personEmail = `e2e.branding-added.${theme}.${project}@example.invalid`;

          // oxlint-disable no-await-in-loop -- one theme at a time, under one lock.
          await queryDatabase(
            `update tenant_branding set
             email_sender_name = 'Branded Sender', email_reply_to = 'replies@example.invalid', email_footer_text = '${footer}',
             support_email = 'help@example.invalid', terms_url = '${publicUrl}/terms',
             privacy_url = '${publicUrl}/privacy'`
          );

          // Everything the Branding page edits goes through it, and one Publish. The previous
          // round's reader is still signed in to Keycloak, so its session goes first.
          await context.clearCookies();
          await signInThroughKeycloak(page, {
            email: e2eBrandingAdminEmail(project),
          });
          await page.goto("/admin/branding");

          const company = page.getByRole("textbox", { name: "Company name" });

          // A fill before the read answers would be replaced by the published row.
          await expect(company).not.toHaveValue("");
          await company.fill(companyName);
          await page
            .getByRole("textbox", { name: "Product name" })
            .fill("Branded Ops");
          await page.getByRole("tab", { name: "Colors" }).click();
          await page
            .getByRole("textbox", { name: "Primary color", exact: true })
            .fill("#0f766e");
          await page
            .getByRole("radio", { name: theme === "light" ? "Light" : "Dark" })
            .check();
          await page.getByRole("tab", { name: "Sign-in" }).click();
          await page
            .getByRole("textbox", { name: "Welcome text" })
            .fill(`Welcome ${theme}`);
          await page
            .getByRole("textbox", { name: "Background color", exact: true })
            .fill("#f5f5f4");
          await publishBranding(page);

          // AC-12: a signed-out visitor sees the new branding on the sign-in page.
          await context.clearCookies();
          await openBrandedSignIn(page, companyName);

          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme
          );
          await expect(page.getByTestId("sign-in-welcome")).toHaveText(
            `Welcome ${theme}`
          );
          await expect(
            page.getByRole("link", { name: "Sign in with SSO" })
          ).toHaveCSS("background-color", "rgb(15, 118, 110)");
          await expect(
            page.getByRole("link", { name: "help@example.invalid" })
          ).toHaveAttribute("href", "mailto:help@example.invalid");
          await expect(page.getByText("Branded Ops").last()).toBeVisible();
          // F-1: no tenant logo yet, so the one image is the Ops Center mark.
          await expect(page.locator("main img")).toHaveAttribute(
            "src",
            "/brand/icon-blue.svg"
          );
          await expectNoAxeViolations(page, `the ${theme} sign-in page`);

          // AC-14: one template, rendered with the same branding, reaches Mailpit.
          await queryDatabase(
            `with old as (select id from "user" where email = '${personEmail}'),
                  grants as (delete from role_assignment where principal_id in (select id from old)),
                  members as (delete from group_member where user_id in (select id from old)),
                  sessions as (delete from session where user_id in (select id from old))
             delete from "user" where id in (select id from old)`
          );
          // A message from an earlier run must not pass as this one (acceptance fix 2).
          expect(await clearMailpit(personEmail)).toBe(true);

          await signInThroughKeycloak(page, {
            email: e2eReaderEmail("branding", project),
          });
          await page.goto("/admin/people");
          await page.getByRole("button", { name: "Add person" }).click();

          const addDialog = page.getByRole("dialog", { name: "Add person" });

          await addDialog
            .getByLabel("Email", { exact: true })
            .fill(personEmail);
          await addDialog
            .getByLabel("Display name", { exact: true })
            .fill(`Branded ${theme}`);
          await addDialog
            .getByRole("button", { name: "Add person" })
            .press("Enter");

          const mail = await waitForMessageTo(personEmail);

          expect(mail.From.Name).toBe("Branded Sender");
          expect(mail.ReplyTo.map((reply) => reply.Address)).toEqual([
            "replies@example.invalid",
          ]);

          for (const part of [mail.HTML, mail.Text]) {
            expect(part).toContain(companyName);
            expect(part).toContain(footer);
          }

          expect(mail.HTML).toContain("#0f766e");
          expect(mail.HTML).not.toContain("<img");
          expect(linksIn(mail)).toContain(`${publicUrl}/sign-in`);
          // oxlint-enable no-await-in-loop
        }
      } finally {
        await queryDatabase(SEED_RESET);
      }
    },
    LOCK_WAIT_MS
  );
});

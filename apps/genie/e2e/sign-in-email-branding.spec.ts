import { expect, test, type Page } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { linksIn, waitForMessageTo } from "./support/mailpit.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * Spec 3 AC-6, AC-12, AC-14 and AC-15: a branding change reaches the sign-in page and a rendered
 * email as text and color, once with the tenant default theme light and once dark. Publish lands
 * in S3-07, so the change is written to `tenant_branding` directly; the 10-second reader cache
 * (DEC-46) is waited out by polling, never by a fixed sleep.
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

/** Polls the signed-out sign-in page until the reader cache serves the written company name. */
async function openBrandedSignIn(
  page: Page,
  companyName: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.goto("/sign-in");

        return page.getByRole("heading", { level: 1 }).textContent();
      },
      { timeout: 30_000, intervals: [1000] }
    )
    .toBe(companyName);
}

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
            `update tenant_branding set company_name = '${companyName}', product_name = 'Branded Ops',
             primary_color = '#0f766e', primary_foreground = '#ffffff', default_theme = '${theme}',
             login_welcome_text = 'Welcome ${theme}', login_background_color = '#f5f5f4',
             email_sender_name = 'Branded Sender', email_reply_to = 'replies@example.invalid', email_footer_text = '${footer}',
             support_email = 'help@example.invalid', terms_url = '${publicUrl}/terms',
             privacy_url = '${publicUrl}/privacy'`
          );

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
            page.getByRole("link", {
              name: "Sign in with your company account",
            })
          ).toHaveCSS("background-color", "rgb(15, 118, 110)");
          await expect(
            page.getByRole("link", { name: "help@example.invalid" })
          ).toHaveAttribute("href", "mailto:help@example.invalid");
          await expect(page.getByText("Branded Ops").last()).toBeVisible();
          await expect(page.locator("main img")).toHaveCount(0);
          await expectNoAxeViolations(page, `the ${theme} sign-in page`);

          // AC-14: one template, rendered with the same branding, reaches Mailpit.
          await queryDatabase(
            `with old as (select id from "user" where email = '${personEmail}'),
                  grants as (delete from role_assignment where principal_id in (select id from old)),
                  members as (delete from group_member where user_id in (select id from old)),
                  sessions as (delete from session where user_id in (select id from old))
             delete from "user" where id in (select id from old)`
          );

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

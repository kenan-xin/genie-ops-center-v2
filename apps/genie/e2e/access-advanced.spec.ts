import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  e2eAccessAdvancedMemberEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { openAdvancedAccess, saveAdvancedAccess } from "./support/access.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { chooseOption } from "./support/choose-option.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-23 through the real realm and the real database: an administrator gives a member core
 * administration in Advanced access, and the member reaches People until the role is removed. Then
 * the administrator gives the member a Placeholder role at one record, picked by search, and the
 * member opens that record and no other, until the role is removed.
 *
 * The phone and desktop projects share one database, so the member and the record are scoped to
 * the project, and the setup deletes the roles an earlier run left.
 */

// Two sign-ins through the real realm, four saves and four polled member reloads take longer than
// the 30 second default.
test.describe.configure({ timeout: 180_000 });

const POLL = { timeout: 30_000, intervals: [1000] };

/** Whether the member reaches the page: it shows its heading, or the refusal. */
async function opens(page: Page, path: string, heading: string) {
  await page.goto(path);

  const denied = page.getByTestId("permission-denied");

  await expect(
    denied.or(page.getByRole("heading", { name: heading, exact: true })).first()
  ).toBeAttached();

  return (await denied.count()) === 0;
}

test("Advanced access gives core administration and a role at one record, and Remove takes each away", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const member = e2eAccessAdvancedMemberEmail(project);
  const recordLabel = `E2E advanced ${project}`;

  await queryDatabase(
    [
      `delete from role_assignment where principal_type = 'user' and principal_id = (select id from "user" where email = '${member}')`,
      `insert into placeholder_record (label) select '${recordLabel}' where not exists (select 1 from placeholder_record where label = '${recordLabel}')`,
    ].join("; ")
  );

  const [recordId] = await queryDatabase(
    `select id from placeholder_record where label = '${recordLabel}'`
  );

  const [otherId] = await queryDatabase(
    "select id from placeholder_record where label = 'e2e-visible'"
  );

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();

  try {
    await signInThroughKeycloak(page, {
      email: e2eReaderEmail("access-advanced", project),
    });
    await page.goto("/admin/access");
    await page.getByRole("button", { name: "People", exact: true }).click();
    await page.getByRole("combobox", { name: "Choose a person" }).click();
    await page.getByLabel("Search people").fill(member);
    await page
      .getByRole("option", { name: new RegExp(`· ${member}$`) })
      .click();

    // E1, E3: Tenant administrator for the whole tenant. The staged add passes axe first.
    let sheet = await openAdvancedAccess(page);

    await chooseOption(
      page,
      "Role",
      "Tenant administrator (Core administration)"
    );
    await sheet.getByRole("button", { name: "Add to the list" }).click();
    await expect(sheet.getByText("Pending", { exact: true })).toBeVisible();
    await expectNoAxeViolations(page, "Advanced access with an add pending");
    await saveAdvancedAccess(page, sheet);

    await signInThroughKeycloak(memberPage, { email: member });
    await expect
      .poll(() => opens(memberPage, "/admin/people", "People"), POLL)
      .toBe(true);

    sheet = await openAdvancedAccess(page);
    await sheet
      .getByRole("button", { name: "Remove Tenant administrator" })
      .click();
    await saveAdvancedAccess(page, sheet);
    await expect
      .poll(() => opens(memberPage, "/admin/people", "People"), POLL)
      .toBe(false);

    // E2: Placeholder user at one record, picked by search.
    const pick = `Placeholder record ${recordId}`;

    sheet = await openAdvancedAccess(page);
    await chooseOption(page, "Role", "Placeholder: Placeholder user");
    await sheet.getByRole("combobox", { name: "Choose a record" }).click();
    await page.getByLabel("Search records").fill(recordLabel);
    await page.getByRole("option", { name: pick, exact: true }).click();
    await sheet.getByRole("button", { name: "Add to the list" }).click();
    await expect(sheet.getByText(`One record · ${pick}`)).toBeVisible();
    await saveAdvancedAccess(page, sheet);

    await expect
      .poll(
        () => opens(memberPage, `/placeholder/${recordId}`, recordLabel),
        POLL
      )
      .toBe(true);
    expect(
      await opens(memberPage, `/placeholder/${otherId}`, "e2e-visible")
    ).toBe(false);

    sheet = await openAdvancedAccess(page);
    await sheet
      .getByRole("button", { name: "Remove Placeholder user" })
      .click();
    await saveAdvancedAccess(page, sheet);
    await expect
      .poll(
        () => opens(memberPage, `/placeholder/${recordId}`, recordLabel),
        POLL
      )
      .toBe(false);
  } finally {
    await memberContext.close();
  }
});

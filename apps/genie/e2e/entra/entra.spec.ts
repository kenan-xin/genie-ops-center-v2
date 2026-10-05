import { appendFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  APP_URL,
  brokeredUser,
  GROUP_LABEL,
  setBrokeredGroups,
  sql,
} from "./stack.ts";
import {
  ENTRA_SECRET,
  entraTenantFromEnv,
  type EntraTenant,
} from "./tenant.ts";

/**
 * The scheduled Entra run: behavior only the real Entra test tenant shows (tech plan D2-2, the
 * S-G guide). Group object ids arrive in the `groups` claim and a group label names them;
 * nested groups and app assignment behave as the guide says; and an observation records what the
 * Keycloak Attribute Importer does to the `groups` attribute when Entra sends no `groups` claim
 * (the 200-group overage), without failing on it.
 */
const tenant = entraTenantFromEnv();

test.skip(tenant === undefined, `${ENTRA_SECRET} is not set`);

const OBJECT_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** The tenant, which the skip above guarantees inside a test. */
function requireTenant(): EntraTenant {
  if (tenant === undefined) throw new Error(`${ENTRA_SECRET} is not set`);

  return tenant;
}

/** Starts a sign-in and fills Entra's own two-step form. */
async function enterEntraCredentials(
  page: Page,
  person: { readonly email: string; readonly password: string }
): Promise<void> {
  await page.goto(`${APP_URL}/api/auth/sign-in/keycloak`);
  await page.locator('input[name="loginfmt"]').fill(person.email);
  await page.locator('input[type="submit"]').click();
  await page.locator('input[name="passwd"]').fill(person.password);
  await page.locator('input[type="submit"]').click();
}

/** Signs in through Entra and waits for the app, declining "Stay signed in?" when Entra asks. */
async function signInWithEntra(
  page: Page,
  person: { readonly email: string; readonly password: string }
): Promise<void> {
  await enterEntraCredentials(page, person);

  await expect
    .poll(
      async () => {
        const decline = page.locator("#idBtn_Back");

        if (await decline.isVisible().catch(() => false)) await decline.click();

        const url = new URL(page.url());

        return `${url.origin}${url.pathname}`;
      },
      { timeout: 90_000 }
    )
    .toBe(`${APP_URL}/`);
}

/** The external ids of a person's directory memberships. */
async function directoryGroups(email: string): Promise<readonly string[]> {
  return sql(
    `select g.external_id from group_member m join "group" g on g.id = m.group_id join "user" u on u.id = m.user_id where u.email = '${email.toLowerCase()}' and m.source = 'idp' order by 1`
  );
}

test("group object ids arrive in the claim, the pre-added group is filled, and its label names it (S-G 3-4, R-24b, R-24c)", async ({
  page,
}) => {
  const entra = requireTenant();

  await signInWithEntra(page, entra.assigned);

  const groups = await directoryGroups(entra.assigned.email);

  expect(groups).toContain(entra.groupId);

  for (const value of groups) expect(value).toMatch(OBJECT_ID);

  // The sync filled the row the administrator pre-added by its object id: same row, now seen.
  expect(
    await sql(
      `select count(*) from "group" where external_id = '${entra.groupId}' and last_seen_at is not null`
    )
  ).toEqual(["1"]);

  // The mapped group's role reaches the person.
  await expect(
    page.getByRole("link", { name: "Placeholder", exact: true })
  ).toBeVisible();

  // The Groups screen shows the label, and the object id stays visible in the inspector. The
  // assigned person is the tenant's first administrator, so the screen opens for them.
  await page.goto("/admin/groups");
  await page
    .getByRole("button", { name: new RegExp(GROUP_LABEL) })
    .first()
    .click();

  const inspector = page.getByRole("dialog", { name: GROUP_LABEL });

  await expect(inspector.getByText(entra.groupId)).toBeVisible();
});

test("a nested group arrives as its own value beside the direct one (S-G 6)", async ({
  page,
}) => {
  const entra = requireTenant();

  await signInWithEntra(page, entra.assigned);

  const groups = await directoryGroups(entra.assigned.email);

  expect(groups).toContain(entra.groupId);
  expect(groups).toContain(entra.parentGroupId);
});

test("Entra refuses a person the app is not assigned to, before any account exists (S-G 1-2)", async ({
  page,
}) => {
  const entra = requireTenant();

  await enterEntraCredentials(page, entra.unassigned);

  // AADSTS50105: the signed-in user is not assigned to a role for the application.
  await expect(page.getByText(/AADSTS50105/)).toBeVisible({ timeout: 60_000 });
  expect(
    await sql(
      `select count(*) from "user" where email = '${entra.unassigned.email.toLowerCase()}'`
    )
  ).toEqual(["0"]);
});

/** Writes one observation to the report and, in GitHub Actions, to the job summary. */
async function record(
  testInfo: { annotations: { type: string; description?: string }[] },
  lines: readonly string[]
): Promise<void> {
  const text = lines.join("\n");

  testInfo.annotations.push({ type: "observation", description: text });
  console.log(text);

  const summary = process.env.GITHUB_STEP_SUMMARY;

  if (summary !== undefined && summary !== "") {
    await appendFile(
      summary,
      `\n### Entra overage observation\n\n${text}\n`,
      "utf8"
    );
  }
}

/**
 * The open question of the S2-05 owner decision: when Entra omits `groups` (more than 200
 * groups), does the Attribute Importer in FORCE mode clear the user's `groups` attribute? If it
 * does, the `genie_groups` marker turns an overage into "removed from every group". This step
 * reports what happened and never fails on it; the owner decides from the report.
 */
test("observe the Attribute Importer when Entra sends no groups claim (overage, reports only)", async ({
  browser,
}, testInfo) => {
  const entra = requireTenant();
  const overage = entra.overage;

  test.skip(overage === undefined, "the secret names no overage person");

  if (overage === undefined) return;

  const seeded = "s2-16-observed-before-overage";

  try {
    const first = await browser.newPage();

    await signInWithEntra(first, overage);
    await first.context().close();

    const afterFirst = (await brokeredUser(overage.email))?.attributes?.[
      "groups"
    ];

    // A value the overage sign-in cannot have sent, so the next sign-in shows clear or keep.
    await setBrokeredGroups(overage.email, [seeded]);

    const second = await browser.newPage();

    await signInWithEntra(second, overage);
    await second.context().close();

    const afterSecond = (await brokeredUser(overage.email))?.attributes?.[
      "groups"
    ];

    const verdict =
      afterSecond === undefined || afterSecond.length === 0
        ? "cleared: the importer emptied the attribute, so the marker reads an overage as zero groups and strips idp memberships"
        : afterSecond.length === 1 && afterSecond[0] === seeded
          ? "kept: the importer left the attribute, so an overage keeps the previous memberships"
          : `other: the attribute holds ${afterSecond.length} value(s)`;

    await record(testInfo, [
      `Verdict: ${verdict}.`,
      `groups attribute after the first sign-in: ${JSON.stringify(afterFirst ?? null)}`,
      `groups attribute after the second sign-in: ${JSON.stringify(afterSecond ?? null)}`,
      `idp memberships in the app: ${(await directoryGroups(overage.email)).length}`,
      `auth:groups_claim_absent rows: ${(
        await sql(
          `select count(*) from audit_event where action = 'auth:groups_claim_absent' and target_id = (select id from "user" where email = '${overage.email.toLowerCase()}')`
        )
      ).join("")}`,
    ]);
  } catch (error) {
    await record(testInfo, [
      `The observation did not complete: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
});

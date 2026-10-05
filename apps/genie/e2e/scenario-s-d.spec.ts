import { expect, test } from "@playwright/test";

import {
  COMPANY_REALM,
  setRealmUserGroupMemberships,
} from "../testing/e2e-keycloak.ts";
import { MANY_GROUPS, preMappedGroupD, scenarioEmail } from "./scenarios.ts";
import {
  BROKER_DB,
  brokeredBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Scenario S-D: a customer on Entra ID, played by the stand-in `company` realm. The proof covers a
 * broad groups claim, a directory group pre-added by its exact claim value before any sign-in
 * (DEC-52), and offboarding when every group is removed (Spec 2 R-58, DEC-41, AC-13).
 */
test("S-D: a broad claim arrives whole and a pre-added group is filled", async ({
  page,
}, testInfo) => {
  const email = scenarioEmail("s-d", "prepad", testInfo.project.name);
  const preMapped = preMappedGroupD(testInfo.project.name);

  // The group was pre-added by its exact claim value, tied to a role, before any sign-in.
  expect(
    await queryBrokerDatabase(
      BROKER_DB,
      `select last_seen_at is null from "group" where external_id = '${preMapped}'`
    )
  ).toEqual(["t"]);

  await signInThroughBroker(page, { baseUrl: brokeredBaseUrl(), email });

  expect(new URL(page.url()).pathname).toBe("/");

  // The pre-added row is the same row the sync filled, and every group the claim carried became
  // an idp membership, as plain names.
  const [preAdded] = await queryBrokerDatabase(
    BROKER_DB,
    `select count(*) || ':' || (min(last_seen_at) is not null) from "group" where external_id = '${preMapped}'`
  );

  expect(preAdded).toBe("1:true");

  const [memberships] = await queryBrokerDatabase(
    BROKER_DB,
    `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
  );

  expect(memberships).toBe(String(MANY_GROUPS.length + 1));

  expect(
    await queryBrokerDatabase(
      BROKER_DB,
      `select count(*) from "group" where external_id like '/%'`
    )
  ).toEqual(["0"]);
});

test("S-D: removing every group offboards at the next sign-in", async ({
  page,
}, testInfo) => {
  const email = scenarioEmail("s-d", "offboard", testInfo.project.name);

  await signInThroughBroker(page, { baseUrl: brokeredBaseUrl(), email });

  const memberCount = async () =>
    queryBrokerDatabase(
      BROKER_DB,
      `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
    );

  expect(await memberCount()).toEqual(["1"]);

  // The provider now sends no groups. The marker rule of DEC-41 makes that empty, not absent, so
  // the sync removes every idp membership instead of keeping a stale one.
  await setRealmUserGroupMemberships(COMPANY_REALM, email, []);

  // A fresh browser: the first session must not short-circuit the second sign-in, so the OAuth
  // callback runs again and the sync sees the now-empty claim.
  await page.context().clearCookies();

  await signInThroughBroker(page, { baseUrl: brokeredBaseUrl(), email });

  expect(await memberCount()).toEqual(["0"]);
});

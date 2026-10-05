import { expect, test } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import {
  BROKER_DB,
  brokeredBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Scenario S-B: the customer's own Keycloak, brokered into ours. The stand-in `company` realm
 * plays the customer's Keycloak, and the app's realm redirects sign-in to it. Two hops carry the
 * groups claim: the company realm's group-membership mapper emits `groups`, the tenant realm's
 * Attribute Importer copies it into the user attribute the `groups` mapper reads. The spec runs at
 * the phone and desktop viewports through the two Playwright projects (Spec 2 R-58, AC-13, AC-20).
 */
test("S-B: jit admits through a mapped group", async ({ page }, testInfo) => {
  const email = scenarioEmail("s-b", "admitted", testInfo.project.name);

  await signInThroughBroker(page, {
    baseUrl: brokeredBaseUrl(),
    email,
  });

  expect(new URL(page.url()).pathname).toBe("/");

  const [person] = await queryBrokerDatabase(
    BROKER_DB,
    `select status || ':' || onboarding from "user" where email = '${email}'`
  );

  expect(person).toBe("active:jit");

  // The claim arrived through both hops as the plain group name, which the sync turned into one
  // idp membership.
  const [membership] = await queryBrokerDatabase(
    BROKER_DB,
    `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
  );

  expect(membership).toBe("1");
});

test("S-B: jit refuses a person without a mapped group", async ({
  page,
}, testInfo) => {
  const email = scenarioEmail("s-b", "refused", testInfo.project.name);

  await signInThroughBroker(page, {
    baseUrl: brokeredBaseUrl(),
    email,
    landing: "/sign-in",
  });

  expect(new URL(page.url()).searchParams.get("error")).toBe("not_registered");
  expect(
    await queryBrokerDatabase(
      BROKER_DB,
      `select id from "user" where email = '${email}'`
    )
  ).toEqual([]);
});

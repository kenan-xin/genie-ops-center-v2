import { expect, test } from "@playwright/test";

import { MANY_GROUPS, preMappedGroupG, scenarioEmail } from "./scenarios.ts";
import {
  BROKER_DB,
  brokeredBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Scenario S-G, the part CI can prove: a large Entra customer using `jit`, with a mapped group
 * pre-added by exact value and many groups whose names arrive flat. The app-assignment and real
 * nested-group behavior need a real tenant and run in the scheduled job, not here (Spec 2 R-58,
 * DEC-52, AC-13). The person is admitted only through the pre-mapped group, and every other group
 * the claim carries becomes a plain-named idp membership.
 */
test("S-G: a large flat claim is admitted through the pre-mapped group", async ({
  page,
}, testInfo) => {
  const email = scenarioEmail("s-g", "many", testInfo.project.name);
  const preMapped = preMappedGroupG(testInfo.project.name);

  await signInThroughBroker(page, { baseUrl: brokeredBaseUrl(), email });

  expect(new URL(page.url()).pathname).toBe("/");

  const [person] = await queryBrokerDatabase(
    BROKER_DB,
    `select status || ':' || onboarding from "user" where email = '${email}'`
  );

  expect(person).toBe("active:jit");

  const [memberships] = await queryBrokerDatabase(
    BROKER_DB,
    `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
  );

  expect(memberships).toBe(String(MANY_GROUPS.length + 1));

  expect(
    await queryBrokerDatabase(
      BROKER_DB,
      `select count(*) from "group" where external_id = '${preMapped}' and last_seen_at is not null`
    )
  ).toEqual(["1"]);
});

test("S-G: a person in no mapped group is refused", async ({
  page,
}, testInfo) => {
  const email = scenarioEmail("s-g", "refused", testInfo.project.name);

  await signInThroughBroker(page, {
    baseUrl: brokeredBaseUrl(),
    email,
    landing: "/sign-in",
  });

  expect(new URL(page.url()).searchParams.get("error")).toBe("not_registered");
});

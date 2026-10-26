import { expect, test } from "@playwright/test";

import { MANY_GROUPS, preMappedGroupD, scenarioEmail } from "./scenarios.ts";
import {
  BROKER_DB,
  brokeredBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Scenario S-D: a customer on Entra ID, played by the stand-in `company` realm. The proof covers a
 * broad groups claim and a directory group pre-added by its exact claim value before any sign-in
 * (Spec 2 R-58, DEC-52, AC-13). Offboarding on an empty claim (DEC-41) is the AC-24 block of
 * `done-when.spec.ts`, and the jit refusal is `scenario-s-b.spec.ts`, both on this deployment.
 */
test(
  "S-D: a broad claim arrives whole and a pre-added group is filled",
  { tag: "@no-screen" },
  async ({ page }, testInfo) => {
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
  }
);

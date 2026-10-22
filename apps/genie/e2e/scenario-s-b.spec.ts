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
 * Attribute Importer copies it into the user attribute the `groups` mapper reads. The refusal
 * asserts no screen, so it runs at the desktop viewport only (DEC-25; Spec 2 R-58, AC-13, AC-20).
 * The brokered jit admission through both hops is the AC-20 block of `done-when.spec.ts`, on this
 * same deployment.
 */
test(
  "S-B: jit refuses a person without a mapped group",
  { tag: "@no-screen" },
  async ({ page }, testInfo) => {
    const email = scenarioEmail("s-b", "refused", testInfo.project.name);

    await signInThroughBroker(page, {
      baseUrl: brokeredBaseUrl(),
      email,
      landing: "/sign-in",
    });

    expect(new URL(page.url()).searchParams.get("error")).toBe(
      "not_registered"
    );
    expect(
      await queryBrokerDatabase(
        BROKER_DB,
        `select id from "user" where email = '${email}'`
      )
    ).toEqual([]);
  }
);

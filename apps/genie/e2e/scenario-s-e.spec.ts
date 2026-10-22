import { expect, test } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import {
  queryBrokerDatabase,
  SAML_DB,
  samlBaseUrl,
} from "./support/brokered.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Scenario S-E: another SSO system. The stand-in `company` realm acts as the customer's SAML 2.0
 * identity provider, and the app's realm brokers to it. The guide covers OIDC and SAML only; LDAP
 * federation is deferred. The proof asserts no screen, so it runs at the desktop viewport only
 * (DEC-25; Spec 2 R-58, AC-13). OIDC is covered by S-B and S-D against the same stand-in. The
 * refusal of an unmapped person is the application's, the same for every protocol, and is
 * proved by `scenario-s-b.spec.ts`.
 */
test(
  "S-E: SAML jit admits through a mapped group",
  { tag: "@no-screen" },
  async ({ page }, testInfo) => {
    const email = scenarioEmail("s-e", "admitted", testInfo.project.name);

    await signInThroughBroker(page, { baseUrl: samlBaseUrl(), email });

    expect(new URL(page.url()).pathname).toBe("/");

    const [person] = await queryBrokerDatabase(
      SAML_DB,
      `select status || ':' || onboarding from "user" where email = '${email}'`
    );

    expect(person).toBe("active:jit");

    const [membership] = await queryBrokerDatabase(
      SAML_DB,
      `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${email}' and gm.source = 'idp'`
    );

    expect(membership).toBe("1");
  }
);

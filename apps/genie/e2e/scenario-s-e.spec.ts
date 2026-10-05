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
 * federation is deferred. The spec runs at both viewports through the two Playwright projects
 * (Spec 2 R-58, AC-13). OIDC is covered by S-B and S-D against the same stand-in.
 */
test("S-E: SAML jit admits through a mapped group", async ({
  page,
}, testInfo) => {
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
});

test("S-E: SAML refuses a person without a mapped group", async ({
  page,
}, testInfo) => {
  const email = scenarioEmail("s-e", "refused", testInfo.project.name);

  await signInThroughBroker(page, {
    baseUrl: samlBaseUrl(),
    email,
    landing: "/sign-in",
  });

  expect(new URL(page.url()).searchParams.get("error")).toBe("not_registered");
  expect(
    await queryBrokerDatabase(
      SAML_DB,
      `select id from "user" where email = '${email}'`
    )
  ).toEqual([]);
});

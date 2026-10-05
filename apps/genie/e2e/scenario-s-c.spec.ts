import { expect, test } from "@playwright/test";

import {
  COMPANY_REALM,
  companyPassword,
  realmSessionIds,
  standinKeycloakPort,
} from "../testing/e2e-keycloak.ts";
import { queryBrokerDatabase } from "./support/brokered.ts";
import {
  CLIENT_ONLY_CLIENT_ID,
  clientOnlyBaseUrl,
  clientOnlyEmail,
} from "./support/client-only.ts";
import { signInThroughRealmForm } from "./support/sign-in.ts";

/** One query against the S-C deployment's own database, as unaligned text rows. */
async function queryClientOnly(sql: string): Promise<readonly string[]> {
  return queryBrokerDatabase("genie_client_only", sql);
}

/**
 * Scenario S-C: Ops Center as a client in the customer's existing realm only (Spec 2 R-54a, R-17,
 * AC-12a). The stand-in `company` realm plays the customer's Keycloak, into which the two shipped
 * client files were imported under a renamed client id. Setup ran with `realm: customer`, so the
 * realm and clients steps recorded `skipped` and no bootstrap credential was read. The spec runs at
 * the phone and desktop viewports through the two Playwright projects.
 */
test("S-C: client-only setup, sign-in, and sign-out that keeps the company session", async ({
  page,
}, testInfo) => {
  const baseUrl = clientOnlyBaseUrl();
  const email = clientOnlyEmail(testInfo.project.name);

  // The client id was renamed by the customer, so a successful sign-in proves the `aud` check uses
  // KEYCLOAK_CLIENT_ID (R-54a, R-54d).
  expect(CLIENT_ONLY_CLIENT_ID).not.toBe("genie-ops-center");

  // AC-12a: setup recorded realm and clients as skipped and recorded the address it used.
  expect(
    await queryClientOnly(
      "select step || ':' || state from setup_step where step in ('realm', 'clients') order by step"
    )
  ).toEqual(["clients:skipped", "realm:skipped"]);

  expect(
    await queryClientOnly(
      "select realm_mode || ' ' || keycloak_url_at_setup from tenant_settings"
    )
  ).toEqual([`customer http://host.docker.internal:${standinKeycloakPort()}`]);

  // The not-set-up gate cleared: health answers ok, not degraded.
  const health = await fetch(`${baseUrl}/api/health`);

  expect(await health.text()).toBe("ok");

  // Sign in on the customer's own realm form (the company realm is the customer's Keycloak).
  await signInThroughRealmForm(page, {
    baseUrl,
    email,
    password: companyPassword(),
  });

  expect(new URL(page.url()).pathname).toBe("/");

  // The claim arrived as the plain group name, and the sync turned it into one idp membership.
  expect(
    await queryClientOnly(
      `select status || ':' || onboarding from "user" where email = '${email}'`
    )
  ).toEqual(["active:jit"]);

  expect(
    await queryClientOnly(
      `select count(*) from group_member gm join "user" u on u.id = gm.user_id
        where u.email = '${email}' and gm.source = 'idp' and gm.group_id in
        (select id from "group" where external_id = 'genie-admins')`
    )
  ).toEqual(["1"]);

  // The company realm holds a session for the person before sign-out.
  expect((await realmSessionIds(COMPANY_REALM, email)).length).toBeGreaterThan(
    0
  );

  // Sign out. In client-only mode the route deletes only the Ops Center session and sends the
  // browser to PUBLIC_URL, never to the realm's end_session_endpoint (R-17, ADR 0010).
  const response = await page.request.post(`${baseUrl}/api/auth/sign-out`, {
    headers: { origin: new URL(baseUrl).origin },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(303);

  const location = new URL(response.headers()["location"] ?? "");

  expect(location.origin).toBe(new URL(baseUrl).origin);
  expect(location.pathname).toBe("/");
  expect(location.href).not.toContain("end_session");

  // The Ops Center session row is gone, but the company realm session is not: it serves the
  // customer's other applications.
  expect(
    await queryClientOnly(
      `select count(*) from session s join "user" u on u.id = s.user_id where u.email = '${email}'`
    )
  ).toEqual(["0"]);

  expect((await realmSessionIds(COMPANY_REALM, email)).length).toBeGreaterThan(
    0
  );

  // The next sign-in completes without a login form, because the company session lasts.
  await page.goto(`${baseUrl}/api/auth/sign-in/keycloak`);

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 45000 })
    .toBe("/");

  expect(
    await queryClientOnly(
      `select count(*) from session s join "user" u on u.id = s.user_id where u.email = '${email}'`
    )
  ).toEqual(["1"]);
});

import { expect, test, type BrowserContext } from "@playwright/test";

import {
  E2E_CLIENT_ID,
  E2E_SIGN_IN_REALM,
  e2eBreakGlassEmail,
  e2eReaderEmail,
  e2eSignOutEmail,
  realmSessionIds,
  standinKeycloakUrl,
} from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * The Better Auth surface as a browser sees it (Spec 2 AC-1, AC-5, R-7, R-17, R-62): the stored
 * realm tokens rest sealed, sign-out ends both sessions, and a realm identity with the break-glass
 * email is refused. Every case signs in through the real Keycloak login form of the realm the
 * setup run created from the template. The catch-all allowlist (R-6, R-7) is proved over the
 * built server by `testing/session-clearing.integration.test.ts`.
 */
const END_SESSION = `${standinKeycloakUrl()}/realms/${E2E_SIGN_IN_REALM}/protocol/openid-connect/logout`;

/** The session token this browser holds: the part of the signed cookie before its signature. */
async function sessionToken(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find(
    (entry) => entry.name === "genie-session"
  );

  if (cookie === undefined)
    throw new Error("The browser holds no genie-session cookie");

  return decodeURIComponent(cookie.value).split(".")[0] ?? "";
}

async function sessionRows(token: string): Promise<number> {
  const [count] = await queryDatabase(
    `select count(*) from session where token = '${token.replaceAll("'", "''")}'`
  );

  return Number(count);
}

/** The payload of a JWT, read without verifying it; Keycloak verified the hint already. */
function jwtPayload(token: string): {
  readonly aud?: string;
  readonly sid?: string;
} {
  // SAFETY: the middle part of a JWT is base64url JSON; only `aud` and `sid` are read.
  return JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
  ) as {
    readonly aud?: string;
    readonly sid?: string;
  };
}

test("the stored realm tokens rest sealed, and sign-out ends both sessions (R-7, R-17)", async ({
  page,
  context,
}, testInfo) => {
  // A person no other test signs in, so no concurrent sign-in replaces the stored id token.
  const email = e2eSignOutEmail(testInfo.project.name);

  await signInThroughKeycloak(page, { email });

  const [tokens] = await queryDatabase(
    `select a.access_token || ' ' || a.refresh_token || ' ' || a.id_token from account a join "user" u on u.id = a.user_id where u.email = '${email}' and a.provider_id = 'keycloak'`
  );

  const stored = (tokens ?? "").split(" ");

  // Three values, none a readable `xxx.yyy.zzz` token (AC-1).
  expect(stored).toHaveLength(3);

  for (const value of stored) {
    expect(value.length).toBeGreaterThan(0);
    expect(value).not.toMatch(/^[\w-]+\.[\w-]+\.[\w-]*$/);
  }

  const token = await sessionToken(context);

  expect(await sessionRows(token)).toBe(1);

  const signOut = await page.request.post("/api/auth/sign-out", {
    headers: { origin: new URL(page.url()).origin },
    maxRedirects: 0,
  });

  expect(signOut.status()).toBe(303);

  // The session row is gone and the cookie is cleared.
  expect(await sessionRows(token)).toBe(0);
  expect(
    signOut
      .headersArray()
      .some(
        (header) =>
          header.name.toLowerCase() === "set-cookie" &&
          header.value.startsWith("genie-session=;")
      )
  ).toBe(true);

  // The redirect is the realm's end-session endpoint with an unsealed, valid id token hint.
  const publicUrl = new URL(page.url()).origin;
  const location = new URL(signOut.headers()["location"] ?? "");
  const hint = location.searchParams.get("id_token_hint") ?? "";
  const { aud, sid } = jwtPayload(hint);

  expect(`${location.origin}${location.pathname}`).toBe(END_SESSION);
  expect(aud).toBe(E2E_CLIENT_ID);
  expect(location.searchParams.get("post_logout_redirect_uri")).toBe(publicUrl);
  expect(location.searchParams.get("state")).toBe("signed_out");
  expect(sid).toBeDefined();
  expect(await realmSessionIds(E2E_SIGN_IN_REALM, email)).toContain(sid);

  // Keycloak accepts the hint, ends the realm session and returns the browser to PUBLIC_URL with
  // the state, which lands it on the signed-out sign-in page (R-17a).
  await page.goto(location.toString());

  await expect
    .poll(() => page.url(), { timeout: 15_000 })
    .toBe(`${publicUrl}/sign-in?error=signed_out`);
  await expect(page.getByTestId("sign-in-banner")).toHaveText(
    "You are signed out."
  );
  expect(await realmSessionIds(E2E_SIGN_IN_REALM, email)).not.toContain(sid);
});

// The end-session URL is not spelled out here: a missing client_id, return address or state makes
// Keycloak refuse the redirect or return elsewhere, which the landing below catches.
test(
  "with no stored id token, sign-out falls back to client_id and still ends the realm session (R-17)",
  { tag: "@no-screen" },
  async ({ page }, testInfo) => {
    const email = e2eReaderEmail("auth", testInfo.project.name);
    const earlier = await realmSessionIds(E2E_SIGN_IN_REALM, email);

    await signInThroughKeycloak(page, { email });

    // The stored token is gone, for example after a secret rotation that cannot unseal it.
    await queryDatabase(
      `update account set id_token = null where provider_id = 'keycloak' and user_id = (select id from "user" where email = '${email}')`
    );

    // This browser's realm session: the one the sign-in above added.
    const sessions = (await realmSessionIds(E2E_SIGN_IN_REALM, email)).filter(
      (sid) => !earlier.includes(sid)
    );

    expect(sessions).toHaveLength(1);

    const signOut = await page.request.post("/api/auth/sign-out", {
      headers: { origin: new URL(page.url()).origin },
      maxRedirects: 0,
    });

    expect(signOut.status()).toBe(303);

    const publicUrl = new URL(page.url()).origin;
    const location = new URL(signOut.headers()["location"] ?? "");

    // Without a hint Keycloak asks for confirmation; confirming ends the realm session and returns
    // the browser to the signed-out page, so "You are signed out." is true.
    await page.goto(location.toString());
    await page.locator("#kc-logout").click();

    await expect
      .poll(() => page.url(), { timeout: 15_000 })
      .toBe(`${publicUrl}/sign-in?error=signed_out`);

    const remaining = await realmSessionIds(E2E_SIGN_IN_REALM, email);

    expect(remaining).not.toContain(sessions[0]);
  }
);

test("a realm identity with the break-glass email is refused and never linked (R-62)", async ({
  page,
}, testInfo) => {
  const email = e2eBreakGlassEmail(testInfo.project.name);

  await signInThroughKeycloak(page, { email, landing: "/sign-in" });

  expect(new URL(page.url()).searchParams.get("error")).toBe(
    "break_glass_not_linkable"
  );
  await expect(page.getByTestId("sign-in-banner")).toBeVisible();

  const linked = await queryDatabase(
    `select a.id from account a join "user" u on u.id = a.user_id where u.email = '${email}' and a.provider_id = 'keycloak'`
  );

  expect(linked).toEqual([]);
});

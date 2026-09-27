import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  sendSmtpMail,
  startIdentityStandins,
  type IdentityStandins,
} from "./identity-standins-process.ts";
import { requireDocker } from "./image-process.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- assertions in this case read as one contract. */

const COMPANY_REALM = "company";

const COMPANY_OIDC_CLIENT = "genie-oidc";

/** The fields of the realm discovery document this smoke test reads. */
type DiscoveryDocument = {
  readonly issuer?: string;
  readonly authorization_endpoint?: string;
};

/** The claims of the access token the company OIDC client returns. */
type AccessTokenClaims = {
  readonly preferred_username?: string;
  readonly groups?: readonly string[];
};

type MailpitMessages = {
  readonly messages?: readonly { readonly Subject?: string }[];
};

/** Polls `probe` until `done` accepts the value or the deadline passes. */
async function pollUntil<T>(
  probe: () => Promise<T | undefined>,
  done: (value: T) => boolean,
  timeoutMs: number
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    last = await probe();

    if (last !== undefined && done(last)) return last;

    await new Promise((settle) => setTimeout(settle, 1000));
  }
  /* eslint-enable no-await-in-loop */

  return last;
}

/**
 * Reads one JSON endpoint, returning undefined while it does not answer. The
 * caller names the documented shape of the endpoint it reads, which is the
 * contract this boundary returns.
 */
async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T | undefined> {
  const response = await fetch(url, init).catch(() => undefined);

  if (response === undefined || !response.ok) return undefined;

  // SAFETY: the caller passes the documented JSON shape of the endpoint it reads.
  return (await response.json()) as T;
}

/** The claims of a JWT access token, or undefined when the value is not one. */
function accessTokenClaims(
  token: string | undefined
): AccessTokenClaims | undefined {
  if (token === undefined) return undefined;

  const [, payload] = token.split(".");

  if (payload === undefined) return undefined;

  try {
    // SAFETY: the token endpoint answered with a JWT, and the middle segment of
    // a JWT is its base64url-encoded JSON claim set.
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AccessTokenClaims;
  } catch {
    return undefined;
  }
}

describe("the identity stand-ins", () => {
  let standins: IdentityStandins | undefined;

  const running = (): IdentityStandins => {
    if (standins === undefined)
      throw new Error("identity stand-ins did not start");

    return standins;
  };

  beforeAll(async () => {
    await requireDocker();

    standins = await startIdentityStandins();
  }, 900000);

  afterAll(async () => {
    await standins?.stop();
  });

  it("answers company realm discovery as an OIDC and SAML identity provider", async () => {
    const discovery = await pollUntil(
      () =>
        fetchJson<DiscoveryDocument>(
          `${running().keycloakUrl}/realms/${COMPANY_REALM}/.well-known/openid-configuration`
        ),
      (document) => document.issuer !== undefined,
      180000
    );

    expect(
      discovery,
      "the company realm discovery document never answered"
    ).toBeDefined();
    // The issuer is the one fixed frontend hostname, not the host that asked, so
    // the host browser and a container see the same value (Specification 02 R-54d).
    expect(discovery?.issuer).toBe(
      `${running().keycloakIssuer}/realms/${COMPANY_REALM}`
    );
    expect(discovery?.issuer).not.toContain("127.0.0.1");
    expect(String(discovery?.authorization_endpoint)).toContain(
      `/realms/${COMPANY_REALM}/protocol/openid-connect/auth`
    );

    // The realm is also a SAML 2.0 identity provider: it serves IdP metadata.
    const descriptor = await fetch(
      `${running().keycloakUrl}/realms/${COMPANY_REALM}/protocol/saml/descriptor`
    ).then(
      async (response) => (response.ok ? await response.text() : ""),
      () => ""
    );

    expect(descriptor).toContain("EntityDescriptor");
  }, 240000);

  it("signs in a seeded user and emits the realm groups claim", async () => {
    const response = await fetch(
      `${running().keycloakUrl}/realms/${COMPANY_REALM}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: COMPANY_OIDC_CLIENT,
          client_secret: "company-oidc-secret",
          username: "alice@company.example",
          password: "password",
          scope: "openid",
        }).toString(),
      }
    );

    expect(response.ok, "the company OIDC client refused the seeded user").toBe(
      true
    );

    // SAFETY: the token endpoint answered with its documented JSON body.
    const body = (await response.json()) as { readonly access_token?: string };
    const claims = accessTokenClaims(body.access_token);

    expect(claims?.preferred_username).toBe("alice@company.example");
    expect(claims?.groups).toEqual(
      expect.arrayContaining(["genie-admins", "staff"])
    );
  }, 60000);

  it("receives a test mail over SMTP", async () => {
    const subject = `stand-in smoke ${Date.now()}`;

    await sendSmtpMail({
      host: "127.0.0.1",
      port: running().smtpPort,
      from: "sender@example.invalid",
      to: "rcpt@example.invalid",
      subject,
      body: "hello from the identity stand-in smoke test",
    });

    const received = await pollUntil<MailpitMessages>(
      () =>
        fetchJson<MailpitMessages>(`${running().mailpitUrl}/api/v1/messages`),
      (messages) =>
        messages.messages?.some((message) => message.Subject === subject) ===
        true,
      30000
    );

    expect(
      received?.messages?.some((message) => message.Subject === subject),
      "Mailpit did not receive the test mail"
    ).toBe(true);
  }, 60000);

  it("answers an LDAP bind and resolves a memberOf group", async () => {
    const result = await running().ldapSearch(
      "(memberOf=cn=ship_crew,ou=people,dc=planetexpress,dc=com)"
    );

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "dn: cn=Philip J. Fry,ou=people,dc=planetexpress,dc=com"
    );
  }, 60000);
});

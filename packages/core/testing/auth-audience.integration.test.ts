import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  account,
  auditEvent,
  session,
  tenantSettings,
  user,
} from "../src/schema.ts";
import type { DisposableDeployment } from "./index.ts";
import {
  assignRole,
  insertGroup,
  insertRole,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

const PUBLIC_URL = "https://test.example.invalid";

const REALM = "genie";

const CLIENT_ID = "genie-ops-center";

const KEY_ID = "aud-test-key";

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

/** The claim set of the test id token; `nonce` is added only when the request carried one. */
type IdTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  groups: readonly string[];
  genie_groups: boolean;
  nonce?: string;
  iat: number;
  exp: number;
};

/**
 * A signed id token whose `aud` is whatever the case sets. The provider's id-token config names
 * `clientId` as the audience (`verify-id-token.mjs` passes it to `jose.jwtVerify`), so a token for
 * another client must fail verification (Spec 2 R-54d, AC-12a).
 */
function signIdToken(input: {
  readonly privateKey: KeyObject;
  readonly issuer: string;
  readonly audience: string;
  readonly email: string;
  readonly groups: readonly string[];
  readonly nonce: string | undefined;
}): string {
  const header = { alg: "RS256", typ: "JWT", kid: KEY_ID };
  const now = Math.floor(Date.now() / 1000);

  const payload: IdTokenPayload = {
    iss: input.issuer,
    aud: input.audience,
    // One subject per email, so a later case's sign-in is a new realm account, not the first one's.
    sub: `aud-test-${input.email}`,
    email: input.email,
    email_verified: true,
    name: "Audience Test",
    groups: input.groups,
    genie_groups: true,
    iat: now,
    exp: now + 300,
  };

  if (input.nonce !== undefined) payload.nonce = input.nonce;

  if (input.nonce !== undefined) payload.nonce = input.nonce;

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(input.privateKey);

  return `${signingInput}.${base64url(signature)}`;
}

/** The callback's `?error=` value, or null on an admitted sign-in. */
function errorOf(response: Response): string | null {
  return new URL(response.headers.get("location")!).searchParams.get("error");
}

describe("the id-token audience check (R-54d, AC-12a)", () => {
  let deployment: DisposableDeployment;
  let realm: Server;
  let issuerUrl: string;
  let audience = `${CLIENT_ID}-foreign`;
  let expectedNonce: string | undefined;
  let email = "audience-check@example.invalid";
  let groups: readonly string[] = ["Mapped"];

  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const jwks = {
    keys: [
      {
        ...publicKey.export({ format: "jwk" }),
        kid: KEY_ID,
        use: "sig",
        alg: "RS256",
      },
    ],
  };

  beforeAll(async () => {
    realm = createServer((request, response) => {
      const base = `http://${request.headers.host}/realms/${REALM}`;
      const path = new URL(request.url ?? "/", base).pathname;

      const reply = (status: number, body: string) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(body);
      };

      if (path.endsWith("/.well-known/openid-configuration")) {
        reply(
          200,
          JSON.stringify({
            issuer: base,
            authorization_endpoint: `${base}/protocol/openid-connect/auth`,
            token_endpoint: `${base}/protocol/openid-connect/token`,
            userinfo_endpoint: `${base}/protocol/openid-connect/userinfo`,
            jwks_uri: `${base}/protocol/openid-connect/certs`,
            id_token_signing_alg_values_supported: ["RS256"],
          })
        );
      } else if (path.endsWith("/protocol/openid-connect/token")) {
        reply(
          200,
          JSON.stringify({
            access_token: "aud-test-access-token",
            token_type: "Bearer",
            expires_in: 300,
            id_token: signIdToken({
              privateKey,
              issuer: base,
              audience,
              email,
              groups,
              nonce: expectedNonce,
            }),
          })
        );
      } else if (path.endsWith("/protocol/openid-connect/certs")) {
        reply(200, JSON.stringify(jwks));
      } else {
        reply(404, "{}");
      }
    });

    await new Promise<void>((resolve) => realm.listen(0, "127.0.0.1", resolve));

    // SAFETY: this server listens on a TCP port, so address() returns AddressInfo.
    const { port } = realm.address() as AddressInfo;

    issuerUrl = `http://127.0.0.1:${port}`;

    deployment = await startDisposableDeployment([], {
      env: {
        BETTER_AUTH_SECRET: "x".repeat(32),
        KEYCLOAK_URL: issuerUrl,
        KEYCLOAK_REALM: REALM,
        KEYCLOAK_CLIENT_ID: CLIENT_ID,
        KEYCLOAK_CLIENT_SECRET: "test-client-secret",
      },
      profile: "application",
    });
    await deployment.context.db
      .insert(tenantSettings)
      .values({ onboardingMode: "jit" });

    const roleId = await insertRole(deployment.context, { permissions: [] });

    const groupId = await insertGroup(deployment.context, [], {
      source: "idp",
      externalId: "Mapped",
      lastSeenAt: null,
    });

    await assignRole(deployment.context, {
      roleId,
      principal: { type: "group", id: groupId },
    });
  }, 120_000);

  afterAll(async () => {
    await deployment?.stop();
    await new Promise<void>((resolve) => realm.close(() => resolve()));
  });

  /** Drives the full sign-in callback and answers the callback response. */
  async function callback(auth: NonNullable<typeof deployment.context.auth>) {
    const started = await auth.beginKeycloakSignIn({
      headers: new Headers({ origin: PUBLIC_URL }),
      callbackURL: `${PUBLIC_URL}/auth/complete`,
      errorCallbackURL: `${PUBLIC_URL}/sign-in`,
    });

    if (started.url === undefined)
      throw new Error("OAuth authorization URL was not issued");

    // The provider requires verified id tokens, so the authorization request carries a nonce the
    // signed token must echo; the stub reads it here.
    expectedNonce = new URL(started.url).searchParams.get("nonce") ?? undefined;

    const state = new URL(started.url).searchParams.get("state");

    if (state === null) throw new Error("OAuth state was not issued");

    const cookie = started.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .join("; ");

    return deployment.context.authRequestScope.run(() =>
      auth.handler(
        new Request(
          `${PUBLIC_URL}/api/auth/callback/keycloak?code=test-code&state=${encodeURIComponent(state)}`,
          { headers: { cookie } }
        )
      )
    );
  }

  it("refuses an id token whose aud is another client", async () => {
    const auth = deployment.context.auth;

    if (auth === undefined) throw new Error("auth member was not built");

    expect(await auth.ensureDiscovery()).toEqual({ ready: true });

    audience = `${CLIENT_ID}-foreign`;

    const response = await callback(auth);

    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.get("location")!).searchParams.get("error")
    ).toBe("unable_to_get_user_info");
    expect(await deployment.context.db.select().from(user)).toHaveLength(0);
    expect(await deployment.context.db.select().from(account)).toHaveLength(0);
  });

  it("accepts the same token when aud is KEYCLOAK_CLIENT_ID", async () => {
    const auth = deployment.context.auth;

    if (auth === undefined) throw new Error("auth member was not built");

    audience = CLIENT_ID;

    const response = await callback(auth);

    // A verified token on a jit sign-in with a mapped group is admitted, which proves the
    // signature and the audience both passed; otherwise the first case's refusal would be vacuous.
    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.get("location")!).searchParams.get("error")
    ).toBeNull();
    expect(await deployment.context.db.select().from(user)).toHaveLength(1);
  });

  function authOf() {
    const auth = deployment.context.auth;

    if (auth === undefined) throw new Error("auth member was not built");

    return auth;
  }

  /** Swaps in a configured mailer that records each send; the returned function restores it. */
  function recordMail() {
    const original = deployment.context.mailer;
    const sent: { templateId: string; to: string }[] = [];

    // SAFETY: the context's mailer member is a fixed object; the swap is restored by `restore`.
    (deployment.context as { mailer: typeof original }).mailer = {
      ...original,
      provider: "smtp",
      send: async ({ templateId, to }) => {
        sent.push({ templateId, to });
      },
    };

    return {
      sent,
      restore: () => {
        // SAFETY: restores the fixed mailer member swapped out above.
        (deployment.context as { mailer: typeof original }).mailer = original;
      },
    };
  }

  it("AC-2 R-9: a refused jit sign-in with no mapped group writes no user and no session row", async () => {
    audience = CLIENT_ID;
    email = "unmapped@example.invalid";
    groups = ["Unmapped"];

    const sessionsBefore = await deployment.context.db.select().from(session);
    const response = await callback(authOf());

    expect(errorOf(response)).toBe("not_registered");
    expect(
      await deployment.context.db
        .select()
        .from(user)
        .where(eq(user.email, email))
    ).toHaveLength(0);
    expect(await deployment.context.db.select().from(session)).toHaveLength(
      sessionsBefore.length
    );
  });

  it("AC-2 R-8 R-12: a person who already exists by email links the realm account without a second user row", async () => {
    audience = CLIENT_ID;
    email = "pre-added@example.invalid";
    groups = ["Mapped"];

    const userId = await insertUser(deployment.context, {
      email,
      status: "pending",
      onboarding: "invited",
      firstSignInAt: null,
    });

    const response = await callback(authOf());

    expect(errorOf(response)).toBeNull();

    const people = await deployment.context.db
      .select({ id: user.id, status: user.status })
      .from(user)
      .where(eq(user.email, email));

    expect(people).toEqual([{ id: userId, status: "active" }]);
    expect(
      await deployment.context.db
        .select()
        .from(account)
        .where(
          and(eq(account.userId, userId), eq(account.providerId, "keycloak"))
        )
    ).toHaveLength(1);
  });

  it("AC-10 AC-9a R-44 R-47 R-40a: an OAuth sign-in writes one auth:sign_in row and sends the new-device email, and the jit admission sends no invitation", async () => {
    // The new-device handler reads the company name, which the seed step writes.
    await markSetupDone(deployment.context);

    audience = CLIENT_ID;
    email = "new-device@example.invalid";
    groups = ["Mapped"];

    const mail = recordMail();

    try {
      const response = await callback(authOf());

      expect(errorOf(response)).toBeNull();

      const [person] = await deployment.context.db
        .select({ id: user.id, onboarding: user.onboarding })
        .from(user)
        .where(eq(user.email, email));

      expect(person?.onboarding).toBe("jit");
      expect(
        await deployment.context.db
          .select()
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.actorUserId, person?.id ?? ""),
              eq(auditEvent.action, "auth:sign_in")
            )
          )
      ).toHaveLength(1);
      expect(mail.sent).toEqual([
        { templateId: "new-device-sign-in", to: email },
      ]);
    } finally {
      mail.restore();
    }
  });
});

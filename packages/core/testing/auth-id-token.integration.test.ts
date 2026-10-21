import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { account, tenantSettings, user } from "../src/schema.ts";
import type { DisposableDeployment } from "./index.ts";
import {
  assignRole,
  insertGroup,
  insertRole,
  startDisposableDeployment,
} from "./index.ts";

const PUBLIC_URL = "https://test.example.invalid";

const REALM = "genie";

describe("the verified Keycloak ID-token boundary", () => {
  let deployment: DisposableDeployment;
  let issuerUrl: string;
  let userInfoReads = 0;
  const email = `userinfo-only-${randomUUID()}@example.invalid`;

  const realm = createServer((request, response) => {
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
        })
      );
    } else if (path.endsWith("/protocol/openid-connect/token")) {
      reply(
        200,
        JSON.stringify({
          access_token: "userinfo-only-token",
          token_type: "Bearer",
          expires_in: 300,
        })
      );
    } else if (path.endsWith("/protocol/openid-connect/userinfo")) {
      userInfoReads += 1;
      reply(
        200,
        JSON.stringify({
          sub: "userinfo-only-subject",
          email,
          email_verified: true,
          name: "Unverified Person",
          groups: ["Mapped"],
          genie_groups: true,
        })
      );
    } else if (path.endsWith("/protocol/openid-connect/certs")) {
      reply(200, JSON.stringify({ keys: [] }));
    } else {
      reply(404, "{}");
    }
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => realm.listen(0, "127.0.0.1", resolve));

    // SAFETY: this server listens on a TCP port, so address() returns AddressInfo.
    const { port } = realm.address() as AddressInfo;

    issuerUrl = `http://127.0.0.1:${port}`;
    deployment = await startDisposableDeployment([], {
      env: {
        BETTER_AUTH_SECRET: "x".repeat(32),
        KEYCLOAK_URL: issuerUrl,
        KEYCLOAK_REALM: REALM,
        KEYCLOAK_CLIENT_ID: "genie-ops-center",
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

  it("refuses a callback without an ID token even when userinfo offers a mapped group", async () => {
    const auth = deployment.context.auth;

    if (auth === undefined) throw new Error("auth member was not built");

    expect(await auth.ensureDiscovery()).toEqual({ ready: true });

    const started = await auth.beginKeycloakSignIn({
      headers: new Headers({ origin: PUBLIC_URL }),
      callbackURL: `${PUBLIC_URL}/auth/complete`,
      errorCallbackURL: `${PUBLIC_URL}/sign-in`,
    });

    if (started.url === undefined)
      throw new Error("OAuth authorization URL was not issued");

    const state = new URL(started.url).searchParams.get("state");

    if (state === null) throw new Error("OAuth state was not issued");

    const cookie = started.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .join("; ");

    const response = await deployment.context.authRequestScope.run(() =>
      auth.handler(
        new Request(
          `${PUBLIC_URL}/api/auth/callback/keycloak?code=test-code&state=${encodeURIComponent(state)}`,
          { headers: { cookie } }
        )
      )
    );

    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.get("location")!).searchParams.get("error")
    ).toBe("unable_to_get_user_info");
    expect(userInfoReads).toBe(0);
    expect(await deployment.context.db.select().from(user)).toHaveLength(0);
    expect(await deployment.context.db.select().from(account)).toHaveLength(0);
  });
});

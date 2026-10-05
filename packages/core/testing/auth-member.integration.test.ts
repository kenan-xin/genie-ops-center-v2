import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";

import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditEvent,
  groupMember,
  notification,
  session as sessionTable,
  user,
} from "../src/schema.ts";
import type { AuthMember } from "../src/services/auth/index.ts";
import {
  accountHooks,
  BREAK_GLASS_NOT_LINKABLE,
  createAuthMember,
  isPlainJwt,
} from "../src/services/auth/index.ts";
import { syncGroupMemberships } from "../src/services/auth/onboarding.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import type { DisposableDeployment } from "./index.ts";
import { insertCredentialPerson, startDisposableDeployment } from "./index.ts";

/**
 * The Better Auth instance, its discovery state and sign-out (Spec 2 AC-1, R-4 to R-8, R-13,
 * R-17, R-54d), against a real Postgres with the real core history. Nothing mocks the database
 * and nothing fakes a session.
 */
const PUBLIC_URL = "https://test.example.invalid";

const REALM = "genie";

/** An unreachable realm: the instance is built, discovery fails, and sign-in refuses (R-54d). */
const AUTH_ENV = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  KEYCLOAK_URL: "http://127.0.0.1:1",
  KEYCLOAK_REALM: REALM,
  KEYCLOAK_CLIENT_ID: "genie-ops-center",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret",
};

/** The same values in the shape the auth member takes, for a direct `createAuthMember` call. */
const AUTH_MEMBER = {
  betterAuthSecret: "x".repeat(32),
  keycloakUrl: "http://127.0.0.1:1",
  keycloakRealm: REALM,
  keycloakClientId: "genie-ops-center",
  keycloakClientSecret: "test-client-secret",
};

const PASSWORD = "break-glass-password-14";

/**
 * The enforced session read reads `session_idle_minutes` through the settings reader (R-14),
 * which fails closed while the row the `seed` step owns is absent. A deployment here carries the
 * default row, so the idle rule answers with the tenant's default 15 minutes.
 */
async function seedSettingsRow(
  deployment: DisposableDeployment
): Promise<void> {
  await deployment.context.db.$client.query(
    "insert into tenant_settings default values"
  );
}

function authOf(deployment: DisposableDeployment): AuthMember {
  const auth = deployment.context.auth;

  if (auth === undefined)
    throw new Error("the deployment built no auth member");

  return auth;
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
}

async function signInWithPassword(
  auth: AuthMember,
  email: string
): Promise<Response> {
  return auth.handler(
    new Request(`${PUBLIC_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": PUBLIC_URL,
      },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
  );
}

describe("the Better Auth instance", () => {
  let first: DisposableDeployment;
  let second: DisposableDeployment;

  beforeAll(async () => {
    [first, second] = await Promise.all([
      startDisposableDeployment([], { env: AUTH_ENV, profile: "application" }),
      startDisposableDeployment([], { env: AUTH_ENV, profile: "application" }),
    ]);

    await Promise.all([seedSettingsRow(first), seedSettingsRow(second)]);
  }, 240_000);

  afterAll(async () => {
    await Promise.all([first?.stop(), second?.stop()]);
  });

  it("the two-context auth isolation test each context holds its own instance and neither answers for the other", async () => {
    // Each context built its own member, not a module-level singleton (DEC-34, R-4).
    expect(first.context.auth).toBeDefined();
    expect(second.context.auth).toBeDefined();
    expect(first.context.auth).not.toBe(second.context.auth);

    const firstAuth = authOf(first);

    const userId = await insertCredentialPerson(first.context, {
      email: "admin@example.com",
      password: PASSWORD,
    });

    const response = await signInWithPassword(firstAuth, "admin@example.com");

    expect(response.status).toBe(200);

    const cookie = cookieOf(response);

    expect(cookie.length).toBeGreaterThan(0);

    // The session it created is served by the first context...
    const mine = await firstAuth.getSession({
      headers: new Headers({ cookie }),
    });

    expect(mine?.user.id).toBe(userId);

    // ...and the second context, on its own database, answers nothing for the same cookie.
    const theirs = await authOf(second).getSession({
      headers: new Headers({ cookie }),
    });

    expect(theirs).toBeNull();
  });

  it("break-glass email and password signs in while the realm discovery does not answer", async () => {
    const auth = authOf(first);

    // The instance is built at start, so the discovery failure is a degraded state, never a
    // failed start (DEC-24, R-54d).
    const discovery = await auth.discovery();
    const settled = await auth.ensureDiscovery();

    expect(settled.ready).toBe(false);
    expect(discovery.ready === false || settled.ready === false).toBe(true);

    const userId = await insertCredentialPerson(second.context, {
      email: "offline@example.com",
      password: PASSWORD,
    });

    const response = await signInWithPassword(
      authOf(second),
      "offline@example.com"
    );

    expect(response.status).toBe(200);

    const session = await authOf(second).getSession({
      headers: new Headers({ cookie: cookieOf(response) }),
    });

    expect(session?.user.id).toBe(userId);
  });

  it("break-glass sign-in leaves directory memberships and OAuth events untouched", async () => {
    const email = `break-glass-${randomUUID()}@example.invalid`;

    const userId = await insertCredentialPerson(second.context, {
      email,
      password: PASSWORD,
    });

    await syncGroupMemberships(second.context, userId, ["Keep"]);

    const response = await signInWithPassword(authOf(second), email);

    expect(response.status).toBe(200);
    expect(
      await second.context.db
        .select()
        .from(groupMember)
        .where(
          and(eq(groupMember.userId, userId), eq(groupMember.source, "idp"))
        )
    ).toHaveLength(1);
    expect(
      await second.context.db
        .select()
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.actorUserId, userId),
            eq(auditEvent.action, "auth:sign_in")
          )
        )
    ).toHaveLength(0);
    expect(
      await second.context.db
        .select()
        .from(notification)
        .where(eq(notification.userId, userId))
    ).toHaveLength(0);
  });

  it("names the session cookie __Host-genie-session with the secure flag over HTTPS (R-4a)", async () => {
    await insertCredentialPerson(first.context, {
      email: "cookie@example.com",
      password: PASSWORD,
    });

    const response = await signInWithPassword(
      authOf(first),
      "cookie@example.com"
    );

    const cookies = response.headers.getSetCookie();

    const sessionCookie = cookies.find((cookie) =>
      cookie.startsWith("__Host-genie-session=")
    );

    // R-4a: the exact __Host- name, Secure over HTTPS, HttpOnly, SameSite=Lax and Path=/.
    expect(sessionCookie, cookies.join(" | ")).toBeDefined();
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("Path=/");
  });

  it("refuses sign-up while email and password sign-in is enabled", async () => {
    const response = await authOf(first).handler(
      new Request(`${PUBLIC_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", "origin": PUBLIC_URL },
        body: JSON.stringify({
          email: "newcomer@example.com",
          password: PASSWORD,
          name: "Newcomer",
        }),
      })
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("does not let the update-user endpoint write an input:false application column", async () => {
    const auth = authOf(first);

    const userId = await insertCredentialPerson(first.context, {
      email: "columns@example.com",
      password: PASSWORD,
    });

    const signIn = await signInWithPassword(auth, "columns@example.com");
    const cookie = cookieOf(signIn);

    const update = await auth.handler(
      new Request(`${PUBLIC_URL}/api/auth/update-user`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": PUBLIC_URL,
          cookie,
        },
        body: JSON.stringify({
          name: "Changed Name",
          status: "disabled",
          isBreakGlass: false,
        }),
      })
    );

    // Better Auth refuses the write and names the field, so the app column never moves (D2-5).
    expect(update.status).toBe(400);
    expect(await update.json()).toMatchObject({ code: "FIELD_NOT_ALLOWED" });

    // A writable update still works, so the protection is the input:false columns and nothing else.
    const rename = await auth.handler(
      new Request(`${PUBLIC_URL}/api/auth/update-user`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": PUBLIC_URL,
          cookie,
        },
        body: JSON.stringify({ name: "Changed Name" }),
      })
    );

    expect(rename.status).toBe(200);

    const [row] = await first.context.db
      .select({
        status: user.status,
        isBreakGlass: user.isBreakGlass,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, userId));

    expect(row?.name).toBe("Changed Name");
    expect(row?.status).toBe("active");
    expect(row?.isBreakGlass).toBe(true);
  });
});

describe("the stored session address (AC-1, AC-5, R-4a, R-16)", () => {
  let deployment: DisposableDeployment;

  beforeAll(async () => {
    deployment = await startDisposableDeployment([], {
      env: AUTH_ENV,
      profile: "application",
    });
    await seedSettingsRow(deployment);
  }, 240_000);

  afterAll(async () => {
    await deployment?.stop();
  });

  function memberWith(trustedProxies: readonly string[]): AuthMember {
    return createAuthMember({
      db: deployment.context.db,
      publicUrl: PUBLIC_URL,
      logger: silentLogger(),
      settings: deployment.context.settings,
      auth: AUTH_MEMBER,
      trustedProxies,
      runtimeMode: "production",
    });
  }

  /** Signs in with a forwarded chain and answers the `ip_address` the new session row stored. */
  async function storedAddress(
    member: AuthMember,
    forwardedFor: string
  ): Promise<string | null> {
    const email = `address-${randomUUID()}@example.invalid`;

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
    });

    const response = await member.handler(
      new Request(`${PUBLIC_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": PUBLIC_URL,
          "x-forwarded-for": forwardedFor,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      })
    );

    expect(response.status).toBe(200);

    const [row] = await deployment.context.db
      .select({ ipAddress: sessionTable.ipAddress })
      .from(sessionTable)
      .where(eq(sessionTable.userId, userId));

    return row?.ipAddress ?? null;
  }

  it("AC-1 AC-5 R-4a R-16: stores the client address from X-Forwarded-For past a trusted proxy hop, never the proxy's or a spoofed one", async () => {
    const member = memberWith(["10.0.0.0/8"]);

    // The proxy appended its own hop; the trusted hop is stripped and the client remains.
    expect(await storedAddress(member, "203.0.113.7, 10.0.0.2")).toBe(
      "203.0.113.7"
    );

    // A client-sent leftmost value is not trusted: the first untrusted hop from the right wins.
    expect(
      await storedAddress(member, "198.51.100.9, 203.0.113.7, 10.0.0.2")
    ).toBe("203.0.113.7");
  });

  it("AC-10 R-44: sign-out deletes the session row and writes exactly one auth:sign_out row", async () => {
    // The context's own member, which carries the tenant hooks the audit row comes from.
    const member = authOf(deployment);
    const email = `signout-${randomUUID()}@example.invalid`;

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
    });

    const signIn = await signInWithPassword(member, email);

    expect(signIn.status).toBe(200);

    await member.signOut({
      headers: new Headers({ cookie: cookieOf(signIn), origin: PUBLIC_URL }),
      callbackURL: PUBLIC_URL,
    });

    expect(
      await deployment.context.db
        .select()
        .from(sessionTable)
        .where(eq(sessionTable.userId, userId))
    ).toHaveLength(0);
    expect(
      await deployment.context.db
        .select()
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.action, "auth:sign_out"),
            eq(auditEvent.actorUserId, userId)
          )
        )
    ).toHaveLength(1);
  });
});

describe("the discovery retry and swap", () => {
  type RealmStub = {
    readonly start: () => Promise<{ readonly url: string }>;
    readonly open: () => void;
    readonly stop: () => Promise<void>;
  };

  /** A discovery document server that answers 503 until `open` is set. */
  function realmStub(): RealmStub {
    let open = false;

    const server = createServer((request, response) => {
      if (!open) {
        response.writeHead(503);
        response.end();

        return;
      }

      const host = request.headers.host ?? "127.0.0.1";
      const base = `http://${host}/realms/${REALM}`;

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          issuer: base,
          authorization_endpoint: `${base}/protocol/openid-connect/auth`,
          token_endpoint: `${base}/protocol/openid-connect/token`,
          jwks_uri: `${base}/protocol/openid-connect/certs`,
        })
      );
    });

    return {
      start: async () => {
        await new Promise<void>((resolve) =>
          server.listen(0, "127.0.0.1", resolve)
        );

        // SAFETY: the server is listening on a TCP port, so `address()` answers an AddressInfo;
        // only a Unix-socket bind answers a string, which this stub never binds.
        const { port } = server.address() as AddressInfo;

        return { url: `http://127.0.0.1:${port}` };
      },
      open: () => {
        open = true;
      },
      stop: () =>
        new Promise<void>((resolve) => server.close(() => resolve(undefined))),
    };
  }

  it("builds a fresh instance on the first good answer, so the provider comes back (R-54d)", async () => {
    const deployment = await startDisposableDeployment([], {
      env: AUTH_ENV,
      profile: "application",
    });

    const stub = realmStub();

    try {
      const { url } = await stub.start();
      let clock = 1_000_000;

      const member = createAuthMember({
        db: deployment.context.db,
        publicUrl: PUBLIC_URL,
        logger: silentLogger(),
        settings: deployment.context.settings,
        auth: { ...AUTH_MEMBER, keycloakUrl: url },
        trustedProxies: [],
        runtimeMode: "production",
        now: () => clock,
      });

      const degraded = await member.ensureDiscovery();

      expect(degraded).toEqual({
        ready: false,
        cause: "discovery_unreachable",
      });

      stub.open();
      clock += 11_000;

      const direct = await fetch(
        `${url}/realms/${REALM}/.well-known/openid-configuration`
      );

      // SAFETY: this response is the stub's own JSON, whose one field the assertion below checks.
      const directBody = (await direct.json()) as { readonly issuer?: string };

      expect(directBody.issuer).toBe(
        `http://127.0.0.1:${new URL(url).port}/realms/${REALM}`
      );

      const recovered = await member.ensureDiscovery();

      expect(recovered).toEqual({ ready: true });

      // The rebuilt instance's provider survived its own discovery read, so a sign-in starts.
      const started = await member.beginKeycloakSignIn({
        headers: new Headers({ origin: PUBLIC_URL }),
        callbackURL: `${PUBLIC_URL}/auth/complete`,
        errorCallbackURL: `${PUBLIC_URL}/sign-in`,
      });

      expect(started.url).toContain("/protocol/openid-connect/auth");
    } finally {
      await stub.stop();
      await deployment.stop();
    }
  }, 120_000);

  it("answers break-glass sign-in and get-session while Keycloak accepts and never answers (DEC-24, R-54d)", async () => {
    const deployment = await startDisposableDeployment([], {
      env: AUTH_ENV,
      profile: "application",
    });

    // A realm that accepts the connection and then says nothing, which a refused port never shows.
    const sockets = new Set<Socket>();

    const hanging = createTcpServer((socket) => {
      sockets.add(socket);
    });

    await new Promise<void>((resolve) =>
      hanging.listen(0, "127.0.0.1", resolve)
    );

    try {
      // SAFETY: a TCP listen answers an AddressInfo; only a Unix-socket bind answers a string.
      const { port } = hanging.address() as AddressInfo;

      const member = createAuthMember({
        db: deployment.context.db,
        logger: silentLogger(),
        publicUrl: PUBLIC_URL,
        settings: deployment.context.settings,
        auth: { ...AUTH_MEMBER, keycloakUrl: `http://127.0.0.1:${port}` },
        trustedProxies: [],
        runtimeMode: "production",
      });

      await deployment.context.db.$client.query(
        "insert into tenant_settings default values"
      );

      await insertCredentialPerson(deployment.context, {
        email: "hang@example.com",
        password: PASSWORD,
      });

      const startedAt = Date.now();
      const response = await signInWithPassword(member, "hang@example.com");

      expect(response.status).toBe(200);

      const session = await member.getSession({
        headers: new Headers({ cookie: cookieOf(response) }),
      });

      expect(session?.user.email).toBe("hang@example.com");
      // Neither call waited on the hanging realm: the start instance has no provider plugin.
      expect(Date.now() - startedAt).toBeLessThan(3_000);

      // The start-up probe is bounded, so health (which reads this state) answers `degraded`.
      await new Promise((settle) => setTimeout(settle, 5_500));

      expect(member.discovery()).toEqual({
        ready: false,
        cause: "discovery_unreachable",
      });
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) =>
        hanging.close(() => resolve(undefined))
      );
      await deployment.stop();
    }
  }, 120_000);
});

describe("the account hooks", () => {
  let deployment: DisposableDeployment;

  beforeAll(async () => {
    deployment = await startDisposableDeployment([], {
      env: AUTH_ENV,
      profile: "application",
    });
  }, 240_000);

  afterAll(async () => {
    await deployment?.stop();
  });

  const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJwZXJzb24ifQ.c2lnbmF0dXJl";

  function hooks() {
    return accountHooks({ db: deployment.context.db, auth: AUTH_MEMBER });
  }

  it("refuses a realm account for the break-glass user with a named cause (R-62)", async () => {
    const breakGlassId = await insertCredentialPerson(deployment.context, {
      email: "glass@example.com",
      password: PASSWORD,
    });

    await expect(
      hooks().create.before({
        providerId: "keycloak",
        userId: breakGlassId,
        idToken: ID_TOKEN,
      })
    ).rejects.toMatchObject({ body: { code: BREAK_GLASS_NOT_LINKABLE } });

    // Its own credential account is not a link, so it is still written.
    await expect(
      hooks().create.before({ providerId: "credential", userId: breakGlassId })
    ).resolves.toBeUndefined();
  });

  it("seals the id token on create and update with the application secret (R-7)", async () => {
    const personId = randomUUID();

    await deployment.context.db.insert(user).values({
      id: personId,
      name: "Realm Person",
      email: "realm.person@example.com",
      emailVerified: true,
    });

    const created = await hooks().create.before({
      providerId: "keycloak",
      userId: personId,
      idToken: ID_TOKEN,
    });

    const updated = await hooks().update.before({ idToken: ID_TOKEN });

    const sealed = [created, updated].map(
      (result) => result?.data.idToken ?? ""
    );

    for (const value of sealed) {
      expect(isPlainJwt(value)).toBe(false);
      expect(value).not.toContain(ID_TOKEN);
    }

    const unsealed = await Promise.all(
      sealed.map((value) =>
        symmetricDecrypt({ key: AUTH_MEMBER.betterAuthSecret, data: value })
      )
    );

    expect(unsealed).toEqual([ID_TOKEN, ID_TOKEN]);

    // A sealed value is not sealed twice, and an absent token leaves the write alone.
    await expect(
      hooks().update.before({ idToken: created?.data.idToken })
    ).resolves.toBeUndefined();
    await expect(hooks().update.before({})).resolves.toBeUndefined();
  });
});

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { user } from "../src/schema.ts";
import type { AuthMember } from "../src/services/auth/index.ts";
import { createAuthMember } from "../src/services/auth/index.ts";
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
});

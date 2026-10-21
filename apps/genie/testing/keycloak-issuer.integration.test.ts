import {
  createTenantContext,
  migrationPlan,
  runMigrations,
  SETUP_STEPS,
} from "@genie/core";
import { markSetupDone, startDisposablePostgres } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startIdentityStandins,
  stopIdentityStandins,
  type IdentityStandins,
} from "./identity-standins-process.ts";
import { runBuiltAppUntilExit, startBuiltApp } from "./start-built-app.ts";
import { scopedPort } from "./worktree-scope.ts";

/**
 * The Keycloak address guard and the issuer check against real services (Spec 2 R-54c, R-54d).
 *
 * The address guard runs after migrations and before the process serves, so a mismatch is a start
 * refusal with the cause in the log. The issuer check reads a real Keycloak's discovery document:
 * when it answers with an issuer other than normalized `KEYCLOAK_URL`, the process exits at start
 * (setup already satisfied) and refuses sign-in with a named cause (setup not yet satisfied).
 *
 * A real Keycloak advertises the fixed `KC_HOSTNAME` the stand-in stack sets
 * (`host.docker.internal`), while the built app here is a host process that reaches it on
 * loopback, so the two addresses differ and the issuer is genuinely mismatched.
 */
const PUBLIC_URL = "https://example.invalid";

const SETUP_URL = "https://id.example.com";

const noopLogger = { error: () => {}, info: () => {}, debug: () => {} };

/** The realm whose discovery document a real Keycloak always answers: the server's own `master`. */
const REALM = "master";

let standins: IdentityStandins | undefined;

beforeAll(async () => {
  standins = await startIdentityStandins();
}, 180000);

afterAll(async () => {
  await standins?.stop();
  await stopIdentityStandins();
});

/** One disposable Postgres with the core history applied and the rows a case needs. */
async function preparedDatabase(input: {
  readonly realmMode?: string;
  readonly keycloakUrlAtSetup?: string | null;
  readonly setupSatisfied: boolean;
}): Promise<{ readonly url: string; readonly stop: () => Promise<void> }> {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    { DATABASE_URL: postgres.url, PUBLIC_URL },
    noopLogger,
    []
  );

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan([]),
    compiledModuleIds: [],
  });

  if (input.realmMode !== undefined) {
    await context.db.$client.query(
      "insert into tenant_settings (realm_mode, keycloak_url_at_setup) values ($1, $2)",
      [input.realmMode, input.keycloakUrlAtSetup ?? null]
    );
  }

  if (input.setupSatisfied) {
    const values = SETUP_STEPS.map((step) => `('${step}', 'done')`).join(", ");

    await context.db.$client.query(
      `insert into setup_step (step, state) values ${values}`
    );
  }

  await context.db.$client.end();

  return { url: postgres.url, stop: postgres.stop };
}

describe("the R-54c address guard refuses to start the application", () => {
  it("exits with the KEYCLOAK_URL mismatch cause against a real database", async () => {
    const database = await preparedDatabase({
      realmMode: "managed",
      keycloakUrlAtSetup: SETUP_URL,
      setupSatisfied: true,
    });

    try {
      const result = await runBuiltAppUntilExit(
        database.url,
        scopedPort(3460),
        { KEYCLOAK_URL: "https://other.example.com" }
      );

      expect(result.code).toBe(1);
      expect(result.output).toContain(
        "KEYCLOAK_URL is not the Keycloak that setup used"
      );
      expect(result.output).not.toContain("bootstrap complete");
    } finally {
      await database.stop();
    }
  }, 180000);

  it("exits when client-only mode runs alongside the bundled Keycloak (AC-12a)", async () => {
    // The recorded address equals `KEYCLOAK_URL`, so only the realm-mode cause can refuse.
    const database = await preparedDatabase({
      realmMode: "customer",
      keycloakUrlAtSetup: "http://127.0.0.1:1",
      setupSatisfied: true,
    });

    try {
      const result = await runBuiltAppUntilExit(
        database.url,
        scopedPort(3463),
        { STACK_PROFILES: "bundled-keycloak" }
      );

      expect(result.code).toBe(1);
      expect(result.output).toContain(
        "client-only mode, but the stack runs its own Keycloak"
      );
      expect(result.output).not.toContain("bootstrap complete");
    } finally {
      await database.stop();
    }
  }, 180000);
});

describe("the R-54d unreachable realm from a built app", () => {
  it("AC-12a R-54d: answers degraded health and refuses sign-in with a named cause while the realm is unreachable", async () => {
    const database = await preparedDatabase({
      realmMode: "managed",
      keycloakUrlAtSetup: null,
      setupSatisfied: false,
    });

    // Setup is complete before start, so only the realm's discovery can make health degraded.
    const setup = createTenantContext(
      { DATABASE_URL: database.url, PUBLIC_URL },
      noopLogger,
      []
    );

    try {
      await markSetupDone(setup);
    } finally {
      await setup.db.$client.end();
    }

    // A closed port that is not the default test address, so no discovery stub answers for it.
    const app = await startBuiltApp(database.url, scopedPort(3464), {
      KEYCLOAK_URL: "http://127.0.0.1:2",
    });

    try {
      const health = await fetch(`${app.baseUrl}/api/health`);

      expect(health.status).toBe(200);
      expect(await health.text()).toBe("degraded");

      const start = await fetch(`${app.baseUrl}/api/auth/sign-in/keycloak`, {
        redirect: "manual",
      });

      expect(start.status).toBe(307);

      const location = new URL(start.headers.get("location") ?? "");

      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("error")).toBe("keycloak_unavailable");

      const social = await fetch(`${app.baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "keycloak" }),
      });

      expect(social.status).toBe(503);

      // SAFETY: the route answers this JSON shape; the assertion below reads one field.
      const body = (await social.json()) as { readonly code?: string };

      expect(body.code).toBe("keycloak_unavailable");
    } finally {
      await app.stop();
      await database.stop();
    }
  }, 180000);
});

describe("the R-54d issuer mismatch against a real Keycloak", () => {
  it("exits at start once setup is satisfied", async () => {
    const database = await preparedDatabase({
      realmMode: "managed",
      keycloakUrlAtSetup: null,
      setupSatisfied: true,
    });

    try {
      const result = await runBuiltAppUntilExit(
        database.url,
        scopedPort(3461),
        {
          KEYCLOAK_URL: standins?.keycloakUrl ?? "",
          KEYCLOAK_REALM: REALM,
        }
      );

      expect(result.code).toBe(1);
      expect(result.output).toContain("keycloak_issuer_mismatch");
      expect(result.output).not.toContain("bootstrap complete");
    } finally {
      await database.stop();
    }
  }, 180000);

  it("refuses sign-in with a named cause once setup becomes satisfied at run time", async () => {
    const database = await preparedDatabase({
      realmMode: "managed",
      keycloakUrlAtSetup: null,
      setupSatisfied: false,
    });

    const app = await startBuiltApp(database.url, scopedPort(3462), {
      KEYCLOAK_URL: standins?.keycloakUrl ?? "",
      KEYCLOAK_REALM: REALM,
    });

    try {
      // Setup completes while the app is running, so the process did not run the start check; the
      // setup gate now opens and the next sign-in reads the mismatched issuer (R-54d).
      const setup = createTenantContext(
        { DATABASE_URL: database.url, PUBLIC_URL },
        noopLogger,
        []
      );

      try {
        await markSetupDone(setup);
      } finally {
        await setup.db.$client.end();
      }

      const start = await fetch(`${app.baseUrl}/api/auth/sign-in/keycloak`, {
        redirect: "manual",
      });

      expect(start.status).toBe(307);

      const location = new URL(start.headers.get("location") ?? "");

      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("error")).toBe(
        "keycloak_issuer_mismatch"
      );

      const social = await fetch(`${app.baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "keycloak" }),
      });

      expect(social.status).toBe(503);

      // SAFETY: the route answers this JSON shape; the assertion below reads one field.
      const body = (await social.json()) as { readonly code?: string };

      expect(body.code).toBe("keycloak_issuer_mismatch");
    } finally {
      await app.stop();
      await database.stop();
    }
  }, 180000);
});

import { afterEach, describe, expect, it } from "vitest";

import type { EnvironmentSource } from "../src/lib/environment/index.ts";
import {
  assertKeycloakAddress,
  checkKeycloakAddress,
  KeycloakAddressError,
} from "../src/services/keycloak/address-guard.ts";
import type { DisposableDeployment } from "./index.ts";
import { startDisposableDeployment } from "./index.ts";

/**
 * The R-54c address guard against a real Postgres: the stored `realm_mode` and
 * `keycloak_url_at_setup` are read from `tenant_settings` and compared with `KEYCLOAK_URL` and
 * `STACK_PROFILES` from the environment. This is the comparison a process runs after migrations
 * and before it serves or works, so a mismatch is the start refusal.
 *
 * The guard runs for a context whose validation profile carries `KEYCLOAK_URL`, so these
 * deployments use the application profile; a `core` profile context skips it.
 */
const SETUP_URL = "https://id.example.com";

const AUTH = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  KEYCLOAK_REALM: "genie",
  KEYCLOAK_CLIENT_ID: "genie-ops-center",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret",
};

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** A deployment whose environment carries `keycloakUrl`. */
async function deployment(keycloakUrl: string): Promise<DisposableDeployment> {
  const started = await startDisposableDeployment([], {
    env: { ...AUTH, KEYCLOAK_URL: keycloakUrl },
    profile: "application",
  });

  cleanups.push(started.stop);

  return started;
}

async function writeSettings(
  started: DisposableDeployment,
  settings: {
    readonly realmMode: string;
    readonly keycloakUrlAtSetup: string | null;
  }
): Promise<void> {
  await started.context.db.$client.query(
    "insert into tenant_settings (realm_mode, keycloak_url_at_setup) values ($1, $2)",
    [settings.realmMode, settings.keycloakUrlAtSetup]
  );
}

const profiles = (stackProfiles: string): EnvironmentSource => ({
  STACK_PROFILES: stackProfiles,
});

/** Runs the guard and returns its refusal, failing the test when it does not refuse. */
async function refusalOf(input: {
  readonly context: DisposableDeployment["context"];
  readonly source: EnvironmentSource;
}): Promise<KeycloakAddressError> {
  try {
    await assertKeycloakAddress(input);
  } catch (cause) {
    if (cause instanceof KeycloakAddressError) return cause;

    throw cause;
  }

  throw new Error("the address guard did not refuse");
}

describe("the R-54c address guard against a real database", () => {
  it("passes when KEYCLOAK_URL is the address setup recorded", async () => {
    const started = await deployment(SETUP_URL);

    await writeSettings(started, {
      realmMode: "managed",
      keycloakUrlAtSetup: SETUP_URL,
    });

    const result = await checkKeycloakAddress({
      context: started.context,
      source: {},
    });

    expect(result).toEqual({ ok: true });

    await expect(
      assertKeycloakAddress({ context: started.context, source: {} })
    ).resolves.toBeUndefined();
  });

  it("refuses a KEYCLOAK_URL that differs from keycloak_url_at_setup", async () => {
    const started = await deployment("https://other.example.com");

    await writeSettings(started, {
      realmMode: "managed",
      keycloakUrlAtSetup: SETUP_URL,
    });

    const error = await refusalOf({
      context: started.context,
      source: {},
    });

    expect(error.code).toBe("keycloak_url_mismatch");
    expect(error.message).toBe(
      "KEYCLOAK_URL is not the Keycloak that setup used"
    );
  });

  it("compares after the R-54c normalization", async () => {
    const started = await deployment("https://id.example.com");

    await writeSettings(started, {
      realmMode: "managed",
      keycloakUrlAtSetup: "https://ID.example.com:443/",
    });

    await expect(
      assertKeycloakAddress({ context: started.context, source: {} })
    ).resolves.toBeUndefined();
  });

  it("refuses client-only mode while STACK_PROFILES holds bundled-keycloak", async () => {
    const started = await deployment(SETUP_URL);

    await writeSettings(started, {
      realmMode: "customer",
      keycloakUrlAtSetup: SETUP_URL,
    });

    const error = await refusalOf({
      context: started.context,
      source: profiles("bundled-keycloak"),
    });

    expect(error.code).toBe("client_only_bundled_keycloak");
    expect(error.message).toBe(
      "client-only mode, but the stack runs its own Keycloak"
    );
  });

  it("skips until setup wrote keycloak_url_at_setup", async () => {
    const started = await deployment("https://other.example.com");

    await writeSettings(started, {
      realmMode: "customer",
      keycloakUrlAtSetup: null,
    });

    await expect(
      assertKeycloakAddress({
        context: started.context,
        source: profiles("bundled-keycloak"),
      })
    ).resolves.toBeUndefined();
  });

  it("skips when no tenant_settings row exists", async () => {
    const started = await deployment("https://other.example.com");

    await expect(
      assertKeycloakAddress({
        context: started.context,
        source: profiles("bundled-keycloak"),
      })
    ).resolves.toBeUndefined();
  });

  it("skips a context whose validation profile carries no KEYCLOAK_URL", async () => {
    const started = await startDisposableDeployment();

    cleanups.push(started.stop);

    await expect(
      assertKeycloakAddress({
        context: started.context,
        source: profiles("bundled-keycloak"),
      })
    ).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import type { AuthDiscoveryState } from "../auth/types.ts";
import { createLogger } from "../logging/index.ts";
import {
  assertKeycloakIssuerAtStart,
  KEYCLOAK_ISSUER_MISMATCH_MESSAGE,
  KeycloakIssuerError,
} from "./startup.ts";

/** A logger whose every line is captured, so the error-level line can be asserted. */
function captureLogger() {
  const lines: string[] = [];

  const logger = createLogger(
    { logLevel: "info" },
    {
      write(line: string) {
        lines.push(line);
      },
    }
  );

  return { lines, logger };
}

/** The discovery probe a case supplies; it records that it was called. */
function probe(state: AuthDiscoveryState) {
  let count = 0;

  return {
    calls: () => count,
    ensureDiscovery: async () => {
      count += 1;

      return state;
    },
  };
}

describe("the R-54d issuer check at start", () => {
  it("exits with the named cause when discovery names another issuer", async () => {
    const auth = probe({ ready: false, cause: "issuer_mismatch" });

    const error = await assertKeycloakIssuerAtStart({
      auth,
      setupSatisfied: async () => true,
      logger: captureLogger().logger,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(KeycloakIssuerError);
    expect(error instanceof KeycloakIssuerError ? error.message : "").toBe(
      KEYCLOAK_ISSUER_MISMATCH_MESSAGE
    );
  });

  it("does not exit when the document does not answer", async () => {
    // A bundled Keycloak still starting answers neither; health is `degraded`, not an exit.
    await expect(
      assertKeycloakIssuerAtStart({
        auth: probe({ ready: false, cause: "discovery_unreachable" }),
        setupSatisfied: async () => true,
        logger: captureLogger().logger,
      })
    ).resolves.toBeUndefined();
  });

  it("does not probe before setup is satisfied", async () => {
    const auth = probe({ ready: false, cause: "issuer_mismatch" });

    await expect(
      assertKeycloakIssuerAtStart({
        auth,
        setupSatisfied: async () => false,
        logger: captureLogger().logger,
      })
    ).resolves.toBeUndefined();

    expect(auth.calls()).toBe(0);
  });

  it("skips without an auth member, so migrate, setup and a plain worker pass", async () => {
    await expect(
      assertKeycloakIssuerAtStart({
        auth: undefined,
        setupSatisfied: async () => true,
        logger: captureLogger().logger,
      })
    ).resolves.toBeUndefined();
  });

  it("logs the mismatch at error level", async () => {
    const capture = captureLogger();

    await assertKeycloakIssuerAtStart({
      auth: probe({ ready: false, cause: "issuer_mismatch" }),
      setupSatisfied: async () => true,
      logger: capture.logger,
    }).catch(() => undefined);

    expect(capture.lines.join("\n")).toContain(
      KEYCLOAK_ISSUER_MISMATCH_MESSAGE
    );
  });
});

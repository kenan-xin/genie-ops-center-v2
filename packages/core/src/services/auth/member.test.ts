import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";

import { silentLogger } from "../logging/index.ts";
import { createAuthMember } from "./index.ts";

const ISSUER = "https://id.example.com/realms/genie";

describe("the auth member's discovery state", () => {
  it("makes a caller during a probe wait for its answer, not read the stale state (R-54d)", async () => {
    let answer: ((response: Response) => void) | undefined;

    // The one probe the member starts at construction stays open until the test answers it.
    const fetchImpl: typeof fetch = () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      });

    const member = createAuthMember({
      db: drizzle.mock(),
      logger: silentLogger(),
      publicUrl: "https://genie.example.com",
      auth: {
        betterAuthSecret: "x".repeat(32),
        keycloakUrl: "https://id.example.com",
        keycloakRealm: "genie",
        keycloakClientId: "genie-ops-center",
        keycloakClientSecret: "secret",
      },
      trustedProxies: [],
      runtimeMode: "production",
      fetchImpl,
      now: () => 1_000_000,
    });

    const during = member.ensureDiscovery();

    // A document naming another issuer settles the probe with a cause the start state lacks.
    answer?.(
      Response.json({
        issuer: "https://elsewhere.example.com/realms/genie",
        authorization_endpoint: `${ISSUER}/auth`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/certs`,
      })
    );

    await expect(during).resolves.toEqual({
      ready: false,
      cause: "issuer_mismatch",
    });
  });
});

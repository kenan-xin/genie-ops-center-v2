import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

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
      // This test never reads a session, so the idle rule's reader is never called.
      settings: {
        get: () => Promise.reject(new Error("no settings in this test")),
      },
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

  it("drops the instance when the plugin's second discovery read names another issuer (R-54d)", async () => {
    const elsewhere = "http://other.example.invalid/realms/genie";

    // The plugin re-reads discovery when the full instance is built. This server answers that read
    // with an issuer other than the configured one, while the probe's own read answers the expected
    // issuer; the member must drop the instance rather than verify tokens against the wrong issuer.
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          issuer: elsewhere,
          authorization_endpoint: `${elsewhere}/auth`,
          token_endpoint: `${elsewhere}/token`,
          jwks_uri: `${elsewhere}/certs`,
        })
      );
    });

    await new Promise<void>((settle) => server.listen(0, "127.0.0.1", settle));

    // SAFETY: a TCP listen answers an AddressInfo; only a Unix-socket bind answers a string.
    const { port } = server.address() as AddressInfo;

    const keycloakUrl = `http://127.0.0.1:${port}`;
    const expectedIssuer = `${keycloakUrl}/realms/genie`;

    try {
      const member = createAuthMember({
        db: drizzle.mock(),
        logger: silentLogger(),
        settings: {
          get: () => Promise.reject(new Error("no settings in this test")),
        },
        publicUrl: "https://genie.example.com",
        auth: {
          betterAuthSecret: "x".repeat(32),
          keycloakUrl,
          keycloakRealm: "genie",
          keycloakClientId: "genie-ops-center",
          keycloakClientSecret: "secret",
        },
        trustedProxies: [],
        runtimeMode: "production",
        // The probe's own read names the expected issuer, so it probes ready and the plugin's
        // second read is what disagrees.
        fetchImpl: async () =>
          Response.json({
            issuer: expectedIssuer,
            authorization_endpoint: `${expectedIssuer}/auth`,
            token_endpoint: `${expectedIssuer}/token`,
            jwks_uri: `${expectedIssuer}/certs`,
          }),
        now: () => 1_000_000,
      });

      await expect(member.ensureDiscovery()).resolves.toEqual({
        ready: false,
        cause: "issuer_mismatch",
      });
    } finally {
      await new Promise<void>((settle) =>
        server.close(() => settle(undefined))
      );
    }
  });
});

import { z } from "zod";

import { DISCOVERY_TIMEOUT_MS } from "./config.ts";
import type { DiscoveryResult } from "./types.ts";

export type { DiscoveryResult } from "./types.ts";

/**
 * The discovery fields this application reads (R-54d). Parsing the document at its I/O boundary
 * means nothing downstream branches on an untyped value, and a document that lacks the endpoints
 * an authorization-code exchange needs reads as not answering.
 */
const discoveryDocument = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  // The provider plugin skips a realm without `jwks_uri`, because id tokens must be verified, so a
  // document without it would read as ready while every sign-in fails (R-54d).
  jwks_uri: z.string(),
  end_session_endpoint: z.string().optional(),
});

export type DiscoveryProbe = {
  readonly probe: () => Promise<DiscoveryResult>;
};

export type DiscoveryProbeInput = {
  readonly discoveryUrl: string;
  /** The normalized `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` a document must name (R-54d). */
  readonly expectedIssuer: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
};

/**
 * One read of the realm's discovery document (R-54d). A document that does not answer, carries no
 * issuer, or names another issuer is not usable; the cause is named so sign-in and health can say
 * why. The expected issuer is compared exactly, because R-54d compares it to the normalized
 * `KEYCLOAK_URL`.
 */
export function createDiscoveryProbe(
  input: DiscoveryProbeInput
): DiscoveryProbe {
  const doFetch = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DISCOVERY_TIMEOUT_MS;

  return {
    async probe(): Promise<DiscoveryResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await doFetch(input.discoveryUrl, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          return { ready: false, cause: "discovery_unreachable" };
        }

        const parsed = discoveryDocument.safeParse(await response.json());

        if (!parsed.success) {
          return { ready: false, cause: "discovery_unreachable" };
        }

        if (parsed.data.issuer !== input.expectedIssuer) {
          return { ready: false, cause: "issuer_mismatch" };
        }

        return {
          ready: true,
          endSessionEndpoint: parsed.data.end_session_endpoint,
        };
      } catch {
        return { ready: false, cause: "discovery_unreachable" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

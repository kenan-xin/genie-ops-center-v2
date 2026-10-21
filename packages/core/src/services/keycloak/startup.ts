import { KEYCLOAK_ISSUER_MISMATCH } from "../auth/config.ts";
import type { AuthDiscoveryState } from "../auth/types.ts";
import { type RedactingLogger } from "../logging/index.ts";

/**
 * The issuer check of Spec 2 R-54d at process start. Once setup is satisfied the application reads
 * the realm's discovery document at start; a document that answers with an issuer other than the
 * normalized `KEYCLOAK_URL` followed by `/realms/${KEYCLOAK_REALM}` makes the process exit. A
 * document that does not answer at all does not: the bundled Keycloak may still be starting, so
 * health answers `degraded` and sign-in refuses until it does (R-54d).
 *
 * Before setup is satisfied there is no realm to compare against, so the check is skipped and the
 * setup gate already refuses sign-in. A process that builds no auth member (migrate, setup, a
 * worker without an identity consumer) skips too.
 */

/**
 * The exit cause a start-time issuer mismatch carries. It is the same named cause the sign-in
 * paths refuse with, so one string appears in the log and in the browser's `?error=`.
 */
export const KEYCLOAK_ISSUER_MISMATCH_MESSAGE = `${KEYCLOAK_ISSUER_MISMATCH}: the realm's discovery document names an issuer other than KEYCLOAK_URL`;

export class KeycloakIssuerError extends Error {
  constructor() {
    super(KEYCLOAK_ISSUER_MISMATCH_MESSAGE);
    this.name = "KeycloakIssuerError";
  }
}

/** What the check reads: the auth member's discovery probe, the setup gate, and a logger. */
export type KeycloakIssuerInput = {
  readonly auth:
    | { readonly ensureDiscovery: () => Promise<AuthDiscoveryState> }
    | undefined;
  /** Read only when there is an auth member, so a profile without one never touches the database. */
  readonly setupSatisfied: () => Promise<boolean>;
  readonly logger: Pick<RedactingLogger, "error">;
};

/**
 * Runs the R-54d start check: skip without an auth member and before setup; otherwise probe
 * discovery and refuse to start on an issuer mismatch. The probe is the member's own, so the
 * ten-second retry and the state sign-in later reads are the same one.
 */
export async function assertKeycloakIssuerAtStart(
  input: KeycloakIssuerInput
): Promise<void> {
  if (input.auth === undefined) return;

  if (!(await input.setupSatisfied())) return;

  const discovery = await input.auth.ensureDiscovery();

  if (!discovery.ready && discovery.cause === "issuer_mismatch") {
    input.logger.error(
      { cause: KEYCLOAK_ISSUER_MISMATCH },
      KEYCLOAK_ISSUER_MISMATCH_MESSAGE
    );

    throw new KeycloakIssuerError();
  }
}

/**
 * Every fixed host port base the test stacks pass to `scopedPort`, in one table.
 *
 * Each stack owns one base, and every base in one worktree moves by the same
 * offset, so distinct bases stay distinct ports. `scopedPort` also steps past a
 * port fetch refuses, so two bases closer than the longest run of refused ports
 * could still meet; `e2e-ports.test.ts` checks that at every offset.
 */
export const BASE_PORTS = {
  /** The shared e2e stack that global setup starts. */
  sharedStack: 3400,
  /** The built apps of `keycloak-issuer.integration.test.ts`, 10 apart so a refused-port step never meets the next. */
  keycloakIssuerMismatch: 3410,
  keycloakIssuerRealMismatch: 3420,
  keycloakIssuerRealRuntime: 3430,
  keycloakIssuerHealthy: 3440,
  keycloakIssuerUnreachable: 3450,
  /** The S2-13 brokered scenarios. */
  brokered: 3500,
  saml: 3600,
  /** The local-accounts scenario S-F. */
  localAccounts: 3700,
  clientOnly: 3800,
  /** The S2-16 invite-mode broker. */
  invite: 3900,
  /** The S3-04a landing deployment. */
  landing: 4000,
  devApp: 5400,
  fixture: 7400,
  setupGate: 9400,
  devDatabase: 11400,
  standinSmtp: 15025,
  standinKeycloak: 15080,
  generatedStackKeycloak: 16080,
  standinMailpit: 18025,
} as const;

/**
 * The band the image-suite host ports move into.
 *
 * The image tests bind fixed `docker run -p` host ports on the same machine as
 * the browser stacks, and two worktrees running the image suite at once collided
 * on them the same way the compose projects did. Every image port is shifted
 * into this one band, above the compose bands, and gets the shared per-worktree
 * offset, so the two groups and the worktrees never share a port.
 */
export const IMAGE_PORT_BASE = 30000;

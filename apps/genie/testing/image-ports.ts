import { scopedPort } from "./worktree-scope.ts";

/** The lowest host port the image suites used before scoping. */
const IMAGE_PORT_MIN = 3399;

/**
 * The band the image-suite host ports move into.
 *
 * The image tests bind fixed `docker run -p` host ports on the same machine as
 * the browser stacks, and two worktrees running the image suite at once collided
 * on them the same way the compose projects did. Every image port is shifted
 * into this one band, above the compose bands (which end near 13399), and gets
 * the shared per-worktree offset, so the two groups and the worktrees never
 * share a port.
 *
 * `configured` is the port the test used before scoping, so the call sites read
 * as the same value they always did. `GENIE_WORKTREE_ID` still selects the
 * namespace.
 */
const IMAGE_PORT_BASE = 30000;

/**
 * The first port of Linux's ephemeral range. Docker and Testcontainers take their
 * automatic host ports from it, so a fixed port at or above it can already be
 * taken by a neighbouring container.
 */
const EPHEMERAL_PORT_MIN = 32768;

export function imageHostPort(configured: number): number {
  const port = scopedPort(IMAGE_PORT_BASE + (configured - IMAGE_PORT_MIN));

  if (port >= EPHEMERAL_PORT_MIN) {
    throw new Error(
      `Image host port ${port} (configured ${configured}) is inside the ephemeral range from ${EPHEMERAL_PORT_MIN}, where Docker assigns automatic ports. Use a configured port closer to ${IMAGE_PORT_MIN}.`
    );
  }

  return port;
}

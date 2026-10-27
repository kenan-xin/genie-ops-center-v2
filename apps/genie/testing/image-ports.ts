import { IMAGE_PORT_BASE } from "./e2e-ports.ts";
import { scopedPort } from "./worktree-scope.ts";

/** The lowest host port the image suites used before scoping. */
const IMAGE_PORT_MIN = 3399;

/**
 * The first port of Linux's ephemeral range. Docker and Testcontainers take their
 * automatic host ports from it, so a fixed port at or above it can already be
 * taken by a neighbouring container.
 */
const EPHEMERAL_PORT_MIN = 32768;

/**
 * How many worker slots one test's band holds. Playwright raises `workerIndex`
 * after every failed test, so an unbounded `base + workerIndex * 2` grew into
 * the next test's band and two tests bound one port (bead 5ee8). The index wraps
 * inside `WORKER_SLOTS * 2` ports, so bases 100 apart never overlap.
 */
const WORKER_SLOTS = 40;

/** The host port one Playwright worker uses for the image test whose band starts at `base`. */
export function workerImagePort(base: number, workerIndex: number): number {
  return imageHostPort(base + (workerIndex % WORKER_SLOTS) * 2);
}

/**
 * The host port of an image test, moved into the `IMAGE_PORT_BASE` band. `configured` is the port
 * the test used before scoping, so the call sites read as the same value they always did.
 */
export function imageHostPort(configured: number): number {
  const port = scopedPort(IMAGE_PORT_BASE + (configured - IMAGE_PORT_MIN));

  if (port >= EPHEMERAL_PORT_MIN) {
    throw new Error(
      `Image host port ${port} (configured ${configured}) is inside the ephemeral range from ${EPHEMERAL_PORT_MIN}, where Docker assigns automatic ports. Use a configured port closer to ${IMAGE_PORT_MIN}.`
    );
  }

  return port;
}

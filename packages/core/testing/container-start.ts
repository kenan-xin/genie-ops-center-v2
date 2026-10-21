import { randomUUID } from "node:crypto";

import { getContainerRuntimeClient } from "testcontainers";

/**
 * A container definition this helper can start: anything that takes labels and starts, which
 * `GenericContainer` and its module subclasses such as `PostgreSqlContainer` are.
 */
export type StartableContainer<Started> = {
  withLabels(labels: Record<string, string>): { start(): Promise<Started> };
};

/**
 * How many starts one call may make, and how long it waits between them.
 *
 * Testcontainers 12 waits a fixed 10 s for the daemon to report each published host port
 * (`inspectContainerUntilPortsExposed`), and `withStartupTimeout` does not reach that wait. When
 * several integration files start containers at once, and a Keycloak JVM is starting beside
 * them, Docker Desktop can leave a running, healthy container with no host port for over 10 s.
 * The start then fails with `Timed out after 10000ms while waiting for container ports to be
 * bound to the host`, and a new attempt moments later succeeds. These misses come in bursts:
 * one run on a loaded host saw three in a row for one start, so there are five attempts. A
 * failed attempt costs about 12 s with the backoff, so the retries add at most about 50 s to a
 * start. A real failure (no daemon, a bad image, a wait strategy that never passes) still
 * throws on the first attempt.
 */
const START_ATTEMPTS = 5;

const RETRY_BACKOFF_MS = 2000;

const PORT_BIND_TIMEOUT = "waiting for container ports to be bound to the host";

/** Marks each attempt's container, so a failed attempt's container can be found and removed. */
const ATTEMPT_LABEL = "org.genie.test.start-attempt";

/**
 * Starts a container, retrying only the transient host port-bind timeout.
 *
 * A timed-out attempt leaves its container created and running, because testcontainers throws
 * after `docker start` and before it returns a handle. The helper removes that container before
 * the next attempt, so an orphan (a Keycloak in particular) does not keep loading the daemon that
 * the retry waits on. The Ryuk reaper still removes anything left at the end of the run.
 */
export async function startWithPortBindRetry<Started>(
  definition: () => StartableContainer<Started>
): Promise<Started> {
  let lastError: Error | undefined;

  /* oxlint-disable no-await-in-loop -- the retry is sequential by definition: each attempt exists only because the previous one timed out. */
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
    const attemptId = randomUUID();

    try {
      return await definition()
        .withLabels({ [ATTEMPT_LABEL]: attemptId })
        .start();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (
        attempt === START_ATTEMPTS ||
        !lastError.message.includes(PORT_BIND_TIMEOUT)
      ) {
        throw lastError;
      }

      console.warn(
        `container start ${attempt} of ${START_ATTEMPTS} timed out waiting for its host port; retrying`
      );
      await removeAttemptContainer(attemptId);
      await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    }
  }
  /* oxlint-enable no-await-in-loop */

  throw lastError ?? new Error("the container never started");
}

async function removeAttemptContainer(attemptId: string): Promise<void> {
  const client = await getContainerRuntimeClient();
  const orphan = await client.container.fetchByLabel(ATTEMPT_LABEL, attemptId);

  // Removal only frees the daemon sooner. If it fails, Ryuk removes the container at the end of
  // the run, so the retry goes ahead rather than failing the test on cleanup.
  await orphan?.remove({ force: true, v: true }).catch(() => undefined);
}

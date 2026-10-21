import { describe, expect, it } from "vitest";

import { POSTGRES_IMAGE, waitForContainer } from "./generated-stack-process.ts";
import { requireDocker, startImage } from "./image-process.ts";

/** The wait under test, held well above the fail-fast path so a regression spends it. */
const LONG_TIMEOUT_MS = 60000;

/** A fail-fast regression would exceed this; a dead container is detected in about a second. */
const FAIL_FAST_BOUND_MS = 15000;

/** Short enough to prove the timeout path without spending the smoke's 60 s. */
const SHORT_TIMEOUT_MS = 1500;

/** The vitest case budget, above either wait. */
const CASE_TIMEOUT_MS = 60000;

/** The string a failed wait carries, so a case can assert on the whole error. */
async function rejectionOf(work: () => Promise<void>): Promise<string> {
  try {
    await work();

    return "";
  } catch (error) {
    return String(error);
  }
}

/**
 * The readiness wait is what the generated-stack smoke could not explain when
 * it failed: a dead container waited the full deadline and threw a message with
 * no cause. These cases pin the two guarantees the fix added — fail at once
 * when the container has exited, and name Docker's own state and log tail when
 * it has not — before the slow smoke test proves the happy path.
 */
describe("the generated-stack readiness wait", () => {
  it(
    "fails at once, with state and logs, once the container has exited",
    async () => {
      await requireDocker();

      // No POSTGRES_PASSWORD: the entrypoint refuses and exits, which is a real
      // dead container rather than a probe stubbed to fail.
      const dead = await startImage({}, undefined, POSTGRES_IMAGE);
      const startedAt = Date.now();

      try {
        const failure = await rejectionOf(() =>
          waitForContainer({
            name: dead.id,
            timeoutMs: LONG_TIMEOUT_MS,
            failure: "Probe never saw readiness",
            probe: async () => false,
          })
        );

        expect(failure).toContain("Probe never saw readiness");
        expect(failure).toContain("the container exited (exit code 1");
        expect(failure).toContain("Status=exited ExitCode=1");
        expect(failure).toContain("last 40 log lines");
        expect(failure).toContain("superuser password is not specified");
        // The point of failing fast is that it does not spend the 60 s deadline.
        expect(Date.now() - startedAt).toBeLessThan(FAIL_FAST_BOUND_MS);
      } finally {
        await dead.stop();
      }
    },
    CASE_TIMEOUT_MS
  );

  it(
    "reports a timeout with the still-running container's state and logs",
    async () => {
      await requireDocker();

      const idle = await startImage({}, undefined, POSTGRES_IMAGE, [
        "sleep",
        "300",
      ]);

      try {
        const failure = await rejectionOf(() =>
          waitForContainer({
            name: idle.id,
            timeoutMs: SHORT_TIMEOUT_MS,
            failure: "Probe never saw readiness",
            probe: async () => false,
          })
        );

        expect(failure).toContain(
          `it did not become ready within ${SHORT_TIMEOUT_MS / 1000}s`
        );
        expect(failure).toContain("Status=running");
        expect(failure).toContain("last 40 log lines");
      } finally {
        await idle.stop();
      }
    },
    CASE_TIMEOUT_MS
  );
});

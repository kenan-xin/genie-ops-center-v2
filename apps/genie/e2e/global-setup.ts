import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The compose file, relative to the workspace root. Playwright is invoked from
 * the workspace root (the documented command), and the guard below fails loudly
 * rather than starting nothing if it is not, because a missing `-f` target is
 * otherwise a silent `up` of an empty stack.
 */
const COMPOSE_FILE = "deploy/stack/compose.e2e.yaml";

const READY_PORT = Number(
  process.env.GENIE_HOST_PORT ?? process.env.E2E_PORT ?? "3400"
);

const READY_URL = `http://127.0.0.1:${READY_PORT}/api/health`;

export const COMPOSE = ["compose", "-p", "genie-s005-e2e", "-f", COMPOSE_FILE];

export default async function globalSetup(): Promise<void> {
  // A targeted run may have started its own deployment already, for example the
  // failing-provider case. Starting a second stack would collide on the host
  // port, so this hook stands aside when one is supplied.
  if (process.env.GENIE_E2E_EXTERNAL === "1") return;

  if (!existsSync(resolve(process.cwd(), COMPOSE_FILE))) {
    throw new Error(
      `No ${COMPOSE_FILE} under ${process.cwd()}. Run Playwright from the workspace root, or set GENIE_E2E_EXTERNAL=1 to use a deployment you started yourself.`
    );
  }

  // A fixed project name, so teardown and the pre-run cleanup can find this
  // stack without a state file and without guessing a container id.
  await run("docker", [...COMPOSE, "up", "-d", "--wait"]);

  const deadline = Date.now() + 120000;

  // Polling is sequential by definition: each attempt exists only because the
  // previous one did not answer 200, and the deadline it compares against is the
  // measurement. Running the attempts in parallel would fire every request at
  // once and destroy the readiness timeline this hook reads.
  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    const ready = await fetch(READY_URL)
      .then((response) => response.status === 200)
      .catch(() => false);

    if (ready) return;

    await new Promise((settle) => setTimeout(settle, 500));
  }
  /* eslint-enable no-await-in-loop */

  const logs = await run("docker", [...COMPOSE, "logs"]).catch(() => ({
    stdout: "",
    stderr: "",
  }));

  throw new Error(
    `The compose deployment never became ready.\n${logs.stdout}${logs.stderr}`
  );
}

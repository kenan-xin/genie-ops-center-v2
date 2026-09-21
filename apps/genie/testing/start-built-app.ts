import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type BuiltApp = {
  readonly baseUrl: string;
  readonly logs: () => string;
  readonly stop: () => Promise<void>;
};

/** How long the standalone server may take to answer. */
const READY_TIMEOUT_MS = 60000;

/** How often it is asked while it has not answered. */
const READY_POLL_MS = 250;

/** One readiness probe. A refused connection is a server that is not up yet, not a failure. */
async function isReady(baseUrl: string): Promise<boolean> {
  return fetch(`${baseUrl}/api/health`)
    .then((response) => response.status === 200)
    .catch(() => false);
}

/**
 * Asks until the server answers or the deadline passes.
 *
 * Written as recursion rather than a loop, because the repository's lint refuses
 * `await` inside a loop and these probes are sequential by nature.
 */
async function waitForReady(
  baseUrl: string,
  deadline: number
): Promise<boolean> {
  if (await isReady(baseUrl)) {
    return true;
  }

  if (Date.now() >= deadline) {
    return false;
  }

  await new Promise((settle) => setTimeout(settle, READY_POLL_MS));

  return waitForReady(baseUrl, deadline);
}

/**
 * Runs the standalone server the build produced.
 *
 * `PUBLIC_URL` is supplied as well as `DATABASE_URL`, because environment
 * validation requires both and the process would otherwise exit before either
 * transport could be exercised.
 */
export async function startBuiltApp(
  databaseUrl: string,
  port: number
): Promise<BuiltApp> {
  // The entry point's depth depends on the build's file tracing root, so it is
  // discovered rather than hard-coded. The same launcher backs the `start`
  // script and the image entrypoint.
  const launcher = resolve(
    import.meta.dirname,
    "../tools/start-standalone.mjs"
  );

  const child = spawn("node", [launcher], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PUBLIC_URL: "https://example.invalid",
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";

  child.stdout.on("data", (chunk) => (output += String(chunk)));
  child.stderr.on("data", (chunk) => (output += String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const ready = await waitForReady(baseUrl, Date.now() + READY_TIMEOUT_MS);

  if (!ready) {
    child.kill("SIGKILL");

    throw new Error(`The built application did not become ready.\n${output}`);
  }

  return {
    baseUrl,
    logs: () => output,
    stop: async () => {
      // SIGTERM, not SIGKILL: the launcher spawns the server as its own child
      // and forwards only SIGTERM and SIGINT. A SIGKILL to the launcher leaves
      // the server orphaned, still holding the port, and the next run then
      // probes a stale bundle and reads its 404s as this run's results.
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }

      const exited = new Promise((settle) => {
        child.once("exit", () => settle(undefined));
      });

      child.kill("SIGTERM");

      await exited;
    },
  };
}

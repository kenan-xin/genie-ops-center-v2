import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { TEST_AUTH_ENV } from "./auth-env.ts";
import { startDiscoveryStub } from "./identity-discovery-stub.ts";

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
 * transport could be exercised. The Section 2 application profile also requires
 * the authentication values; unless the caller's environment names a realm, a
 * throwaway discovery stub answers, so health is `ok` and only a test that
 * proves sign-in uses a real realm.
 */
export async function startBuiltApp(
  databaseUrl: string,
  port: number,
  env: Readonly<Record<string, string>> = {}
): Promise<BuiltApp> {
  // The entry point's depth depends on the build's file tracing root, so it is
  // discovered rather than hard-coded. The same launcher backs the `start`
  // script and the image entrypoint.
  const launcher = resolve(
    import.meta.dirname,
    "../tools/start-standalone.mjs"
  );

  const realmOverride =
    env.KEYCLOAK_URL ?? process.env.KEYCLOAK_URL ?? TEST_AUTH_ENV.KEYCLOAK_URL;

  const stub = await (realmOverride === TEST_AUTH_ENV.KEYCLOAK_URL
    ? startDiscoveryStub()
    : Promise.resolve(undefined));

  const child = spawn("node", [launcher], {
    env: {
      ...process.env,
      ...TEST_AUTH_ENV,
      ...env,
      // The stub's address when the caller named no realm, else the caller's own value.
      KEYCLOAK_URL: stub?.hostUrl ?? realmOverride,
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

    await stub?.stop();

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
        await stub?.stop();

        return;
      }

      const exited = new Promise((settle) => {
        child.once("exit", () => settle(undefined));
      });

      child.kill("SIGTERM");

      await exited;
      await stub?.stop();
    },
  };
}

/**
 * Starts the built application and waits for it to exit, so a test can prove a start-time refusal
 * (R-54c, R-54d) rather than a healthy server. It never waits for readiness: the whole point is
 * that the process refuses before it serves.
 *
 * `env` overrides the authentication values, so a test supplies its own realm or a recorded
 * address. A process that has not exited by `timeoutMs` is killed and reported as `null`; a
 * refusal test asserts the exact code `runBootstrap` exits with (`1`), so a killed or hung process
 * fails it rather than passing on a nonzero check.
 */
export async function runBuiltAppUntilExit(
  databaseUrl: string,
  port: number,
  env: Readonly<Record<string, string>> = {},
  timeoutMs = 60000
): Promise<{ readonly code: number | null; readonly output: string }> {
  const launcher = resolve(
    import.meta.dirname,
    "../tools/start-standalone.mjs"
  );

  const child = spawn("node", [launcher], {
    env: {
      ...process.env,
      ...TEST_AUTH_ENV,
      ...env,
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

  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

  const code = await new Promise<number | null>((settle) => {
    child.once("exit", (exitCode) => settle(exitCode));
    child.once("error", () => settle(null));
  }).finally(() => clearTimeout(timer));

  return { code, output };
}

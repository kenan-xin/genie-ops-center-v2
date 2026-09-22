import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The development browser run.
 *
 * The ordinary end-to-end run drives the built image, where the devtools are
 * excluded on purpose, so it can never show a panel. This one starts the
 * database, runs `next dev` against it on the host, and leaves the server for
 * the specs. That is the only way to see the development branch of the mount in
 * a real browser.
 */
const COMPOSE_FILE = "deploy/stack/compose.dev-e2e.yaml";

export const COMPOSE = ["compose", "-p", "genie-s009-dev", "-f", COMPOSE_FILE];

const DB_PORT = process.env.GENIE_DEV_DB_PORT ?? "5433";

export const DEV_PORT = Number(process.env.GENIE_DEV_PORT ?? "3401");

/** Where the server's process id is left, so teardown can stop it. */
export const PID_FILE = resolve(import.meta.dirname, ".dev-server.pid");

async function isReady(url: string): Promise<boolean> {
  return fetch(url)
    .then((response) => response.status === 200)
    .catch(() => false);
}

/**
 * Asks until the server answers or the deadline passes. Recursion rather than a
 * loop, because this repository's lint refuses `await` inside one and these
 * probes are sequential by nature.
 */
async function waitForReady(url: string, deadline: number): Promise<boolean> {
  if (await isReady(url)) return true;

  if (Date.now() >= deadline) return false;

  await new Promise((settle) => setTimeout(settle, 500));

  return waitForReady(url, deadline);
}

export default async function globalSetup(): Promise<void> {
  if (!existsSync(resolve(process.cwd(), COMPOSE_FILE))) {
    throw new Error(
      `No ${COMPOSE_FILE} under ${process.cwd()}. Run Playwright from the workspace root.`
    );
  }

  await run("docker", [...COMPOSE, "up", "-d", "--wait"]);

  const appRoot = resolve(import.meta.dirname, "../..");

  // `next dev` rather than the built server, because the development branch of
  // the mount is the whole subject of these specs. NODE_ENV is set by `next
  // dev` itself; setting it here would be the test arranging its own result.
  const child = spawn(
    resolve(appRoot, "node_modules/.bin/next"),
    ["dev", "--port", String(DEV_PORT)],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        DATABASE_URL: `postgres://genie:genie@127.0.0.1:${DB_PORT}/genie`,
        PUBLIC_URL: `http://127.0.0.1:${DEV_PORT}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    }
  );

  let output = "";

  child.stdout.on("data", (chunk) => (output += String(chunk)));
  child.stderr.on("data", (chunk) => (output += String(chunk)));
  child.unref();

  writeFileSync(PID_FILE, String(child.pid), "utf8");

  // The first request compiles the route and runs the migrations, so the budget
  // covers a cold start rather than a warm one.
  const ready = await waitForReady(
    `http://127.0.0.1:${DEV_PORT}/api/health`,
    Date.now() + 180000
  );

  if (!ready) {
    // Nothing may be left running when setup itself fails, or the next run
    // meets a held port and a database it did not create.
    await stopEverything();

    throw new Error(`The development server never became ready.\n${output}`);
  }
}

/**
 * Stops the development server and removes the database.
 *
 * The server is started detached, so it leads its own process group and the
 * negative process id reaches the compiler workers with it. Killing the parent
 * alone would leave those workers holding the port.
 *
 * Both halves run even when the first throws, and the database is removed with
 * its volume, so a failed run leaves nothing behind either.
 */
export async function stopEverything(): Promise<void> {
  try {
    if (existsSync(PID_FILE)) {
      const pid = Number(readFileSync(PID_FILE, "utf8"));

      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // Already gone, which is the same end state.
      }

      rmSync(PID_FILE, { force: true });
    }
  } finally {
    await run("docker", [...COMPOSE, "down", "-v"]).catch(() => undefined);
  }
}

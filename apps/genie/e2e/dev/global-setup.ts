import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createTenantContext, seedRoles, SETUP_STEPS } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import {
  assignRole,
  enableModules,
  insertRole,
  insertUser,
  writeModelConnection,
} from "@genie/core/testing";
import {
  insertAgentRecords,
  PLACEHOLDER_AGENT_RECORDINGS,
} from "@genie/module-placeholder/testing";

import { selectedModuleIds, selectedModules } from "../../src/modules.ts";
import { TEST_AUTH_ENV } from "../../testing/auth-env.ts";
import { BASE_PORTS } from "../../testing/e2e-ports.ts";
import { scopedPort, scopedProject } from "../../testing/worktree-scope.ts";

const run = promisify(execFile);

/**
 * The development browser run.
 *
 * The ordinary end-to-end run drives the built image, where the devtools are
 * excluded on purpose, so it can never show a panel. This one starts the
 * database, runs `next dev` against it on the host, and leaves the server for
 * the specs. That is the only way to see the development branch of the mount in
 * a real browser.
 *
 * The compose file is resolved from this file's own location rather than from
 * `process.cwd()`, so the run does not depend on where it was launched from and
 * the Nx target, which starts in the project directory, works like the package
 * script.
 */
const COMPOSE_FILE = resolve(
  import.meta.dirname,
  "../../../../deploy/stack/compose.dev-e2e.yaml"
);

/** `apps/genie`, where the seed command and `next dev` run from. */
const APP_ROOT = resolve(import.meta.dirname, "../..");

export const COMPOSE = [
  "compose",
  "-p",
  scopedProject("genie-s009-dev"),
  "-f",
  COMPOSE_FILE,
];

/**
 * The database's published port. Scoped to this worktree so two runs do not
 * bind the same host port; `playwright.dev.config.ts` and
 * `e2e/dev/devtools.spec.ts` read it through this module rather than a literal,
 * so the leak assertion stays about this run's real port.
 */
export const DEV_DB_PORT = Number(
  process.env.GENIE_DEV_DB_PORT ?? scopedPort(BASE_PORTS.devDatabase)
);

export const DEV_PORT = Number(
  process.env.GENIE_DEV_PORT ?? scopedPort(BASE_PORTS.devApp)
);

/** The demo account the seeded pages are read as (R-59). */
export const DEMO_ACCOUNT_EMAIL = "e2e.demo@example.invalid";

/** The people the agent specs sign in as (Spec 7 R-40, AC-8); each holds one role. */
export const ASK_PEOPLE = {
  phone: "e2e.ask.phone@example.invalid",
  desktop: "e2e.ask.desktop@example.invalid",
  /** Opens another person's session link (B12.5). */
  other: "e2e.ask.other@example.invalid",
  /** Reads the placeholder but may not ask. */
  noAsk: "e2e.no-ask@example.invalid",
} as const;

const ASK_KEYS = ["core:ask:use", "placeholder:read", "placeholder:use"];

const PERMISSIONS_OF = new Map<string, readonly string[]>([
  [ASK_PEOPLE.phone, ASK_KEYS],
  [ASK_PEOPLE.desktop, ASK_KEYS],
  [ASK_PEOPLE.other, ASK_KEYS],
  [ASK_PEOPLE.noAsk, ["placeholder:use"]],
]);

const databaseUrl = () =>
  `postgres://genie:genie@127.0.0.1:${DEV_DB_PORT}/genie`;

const publicUrl = () => `http://127.0.0.1:${DEV_PORT}`;

/** Where the server's process id is left, so teardown can stop it. */
export const PID_FILE = resolve(import.meta.dirname, ".dev-server.pid");

/** Test-only stand-in for `genie-ops setup` until the real setup command lands. */
async function seedTestSetup(): Promise<void> {
  const steps = SETUP_STEPS.map((step) => `('${step}', 'done')`).join(", ");

  await run("docker", [
    ...COMPOSE,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    "genie",
    "-c",
    // The root layout reads branding on every set-up document and the sign-in page reads settings
    // (R-51a), so the two rows `markSetupDone` writes must exist too.
    `insert into setup_step (step, state) values ${steps} on conflict (step) do update set state = 'done', detail = null, updated_at = now(); insert into tenant_settings default values on conflict do nothing; insert into tenant_branding (company_name, product_name, default_locale, default_time_zone) values ('E2E', 'Genie', 'en', 'UTC') on conflict do nothing`,
  ]);
}

/**
 * The setup stand-in's `seed` and `roles` steps, then the seed command twice on this disposable
 * database (P17). The command refuses unless the module is on and its roles exist, so the module
 * is enabled first and its default roles seeded after it, as `genie-ops setup` orders them. A
 * second run must write nothing, which is the command's idempotency proof.
 */
async function seedDemo(): Promise<void> {
  const context = createTenantContext(
    { DATABASE_URL: databaseUrl(), PUBLIC_URL: publicUrl() },
    silentLogger(),
    selectedModuleIds,
    undefined,
    "core"
  );

  try {
    await enableModules(context, selectedModuleIds);
    await seedRoles(context, selectedModules);
    await insertUser(context, {
      email: DEMO_ACCOUNT_EMAIL,
      name: "E2E Demo",
      emailVerified: true,
    });
  } finally {
    await context.db.$client.end();
  }

  // Only what the command documents, beside PATH so `node` resolves: never the test's other env.
  // `NODE_ENV` is the one value Next's global types make required; the command never reads it.
  const env = {
    DATABASE_URL: databaseUrl(),
    DEMO_ACCOUNT_EMAIL,
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PATH: process.env.PATH ?? "",
  };

  const runSeed = async (): Promise<string> => {
    const { stdout } = await run("node", ["testing/seed-demo.ts"], {
      cwd: APP_ROOT,
      env,
    });

    return stdout.trimEnd();
  };

  const first = await runSeed();

  console.log(`Demo seed run 1\n${first}`);

  if (!first.endsWith("Written.")) {
    throw new Error(`The first demo seed run did not write.\n${first}`);
  }

  const second = await runSeed();

  console.log(`Demo seed run 2\n${second}`);

  if (!second.endsWith("Already seeded: nothing to write.")) {
    throw new Error(`The second demo seed run wrote again.\n${second}`);
  }
}

/**
 * AI on with the test settings, the agent's records and the people of `ASK_PEOPLE`, on a tenant
 * context of its own. The reporting date stays the demo seed's `2026-10-27`, the recordings' date.
 * AI on is safe only because `next dev` loads the model stand-in (see the spawn below).
 */
async function seedAgent(): Promise<void> {
  const context = createTenantContext(
    { DATABASE_URL: databaseUrl(), PUBLIC_URL: publicUrl() },
    silentLogger(),
    selectedModuleIds,
    undefined,
    "core"
  );

  try {
    await writeModelConnection(context, {
      allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
      chat: "openai/gpt-6.1-terra",
      document: "anthropic/claude-opus-5.5",
    });
    await insertAgentRecords(context);
    await Promise.all(
      [...PERMISSIONS_OF].map(async ([email, permissions]) => {
        const id = await insertUser(context, { email, emailVerified: true });
        const roleId = await insertRole(context, { permissions });

        await assignRole(context, { roleId, principal: { type: "user", id } });
      })
    );
  } finally {
    await context.db.$client.end();
  }
}

async function isReady(url: string): Promise<boolean> {
  return fetch(url)
    .then((response) => response.status === 200)
    .catch(() => false);
}

/**
 * Whether anything holds the loopback IPv4 address the server binds.
 *
 * A raw connection rather than an HTTP probe, because the thing to keep this
 * run away from is not only a healthy server. A process still shutting down,
 * or one serving something else, answers no `/api/health` and an HTTP probe
 * would call the port free; `next dev` then fails to bind with `EADDRINUSE`,
 * which reads as the server "never becoming ready". A refused connection is the
 * only proof the port is free.
 *
 * The IPv4 loopback only, which is the one address this run binds and probes.
 * A listener on `::1` alone is invisible here and does not conflict.
 */
function isListening(port: number): Promise<boolean> {
  return new Promise((settle) => {
    const socket = createConnection({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.destroy();
      settle(true);
    });
    socket.once("error", () => {
      socket.destroy();
      settle(false);
    });
    socket.setTimeout(2000, () => {
      socket.destroy();
      settle(false);
    });
  });
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
  if (!existsSync(COMPOSE_FILE)) {
    throw new Error(
      `No compose file at ${COMPOSE_FILE}. The development harness cannot start its database.`
    );
  }

  // A pid file left by a killed run names a process this run did not start, and
  // the pid may since have been reused. Remove it before anything writes a new
  // one, so teardown can never signal a stranger's process group.
  rmSync(PID_FILE, { force: true });

  // Anything already holding the port is refused, not tolerated. Next does not
  // move to another port on its own here, so a run that ignored a held port
  // would fail to bind rather than silently drive a stranger's server, and the
  // refusal below says which happened instead of leaving an `EADDRINUSE` in the
  // server's output.
  if (await isListening(DEV_PORT)) {
    throw new Error(
      `Something is already listening on 127.0.0.1:${DEV_PORT}. Stop it, or set GENIE_DEV_PORT to a free port. This run will not start beside a server it did not start.`
    );
  }

  await run("docker", [...COMPOSE, "up", "-d", "--wait"], {
    env: { ...process.env, GENIE_DEV_DB_PORT: String(DEV_DB_PORT) },
  });

  // `--hostname 127.0.0.1` is load-bearing, not tidiness. Next blocks its
  // development-only resources, `/_next/hmr` included, unless the request's
  // origin is one it considers its own, and its allowlist carries `localhost`
  // but not the bare `127.0.0.1`. The browser reaches the server at
  // `127.0.0.1`, so without this the HMR socket is refused, the development
  // client reconnects and reloads in a loop, and the page never hydrates. A
  // `client-only` subtree such as the `ssr: false` devtools mount then never
  // renders at all, which is the failure this harness once mistook for a defect
  // inside the devtools shell.
  //
  // `next dev` rather than the built server, because the development branch of
  // the mount is the whole subject of these specs. NODE_ENV is set by `next
  // dev` itself; setting it here would be the test arranging its own result.
  //
  // `--import` loads the model stand-in (`testing/model-standin.ts`, P13) before the server, so
  // every model request of this run is answered from the placeholder's recordings. A failed
  // import stops `next dev`, so AI on never runs without it.
  const child = spawn(
    resolve(APP_ROOT, "node_modules/.bin/next"),
    ["dev", "--hostname", "127.0.0.1", "--port", String(DEV_PORT)],
    {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        ...TEST_AUTH_ENV,
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: publicUrl(),
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(resolve(APP_ROOT, "testing/model-standin.ts")).href}`.trim(),
        GENIE_E2E_MODEL_RECORDINGS:
          process.env.GENIE_E2E_MODEL_RECORDINGS ??
          PLACEHOLDER_AGENT_RECORDINGS,
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

  await seedTestSetup();
  await seedDemo();
  await seedAgent();
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
        // Terminate, then make sure. A child that ignores the first signal
        // would otherwise keep the port while the database is already gone.
        process.kill(-pid, "SIGTERM");

        await new Promise((settle) => setTimeout(settle, 2000));

        process.kill(-pid, "SIGKILL");
      } catch {
        // Already gone, which is the end state this wanted.
      }
    }
  } finally {
    // Removed whatever happened above, so a later run cannot read a pid that
    // the operating system has since given to something else.
    rmSync(PID_FILE, { force: true });

    await run("docker", [...COMPOSE, "down", "-v"]).catch(() => undefined);
  }
}

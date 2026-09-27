import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { WORKSPACE_ROOT, scopedProject } from "./worktree-scope.ts";

const run = promisify(execFile);

const PROXY_NETWORK = "proxy";

export const POSTGRES_IMAGE = "postgres:18-alpine";

/** The realm `genie-ops setup` creates in the bundled Keycloak for the smoke test. */
const SMOKE_REALM = "smoke";

/** How long a database readiness wait may run before it fails with diagnostics. */
const READINESS_TIMEOUT_MS = 60000;

const READINESS_POLL_MS = 500;

/** The Docker states in which a container can never become ready. */
const TERMINAL_CONTAINER_STATES = new Set(["exited", "dead"]);

const LOG_TAIL_LINES = 40;

type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

async function docker(args: readonly string[]): Promise<CommandResult> {
  return run("docker", [...args], { maxBuffer: 16 * 1024 * 1024 });
}

/** Runs docker and reports only whether it exited zero, treating any failure as "not yet". */
function succeeded(args: readonly string[]): Promise<boolean> {
  return docker(args).then(
    () => true,
    () => false
  );
}

/** The fields of Docker's `inspect .State` that explain a failed readiness wait. */
type ContainerState = {
  readonly Status: string;
  readonly ExitCode: number;
  readonly OOMKilled: boolean;
  readonly Error: string;
};

/** Whether the container has reached a state from which it cannot become ready. */
function isTerminal(
  state: ContainerState | undefined
): state is ContainerState {
  return state !== undefined && TERMINAL_CONTAINER_STATES.has(state.Status);
}

/** Runs docker and returns stdout+stderr even on a nonzero exit, for a diagnostic dump. */
async function dockerText(args: readonly string[]): Promise<string> {
  try {
    const { stdout, stderr } = await docker(args);

    return stdout + stderr;
  } catch (error) {
    // SAFETY: execFile rejects with the captured streams on a nonzero exit.
    const failure = error as {
      readonly stdout?: string | Buffer;
      readonly stderr?: string | Buffer;
    };

    return String(failure.stdout ?? "") + String(failure.stderr ?? "");
  }
}

/** Docker's `.State` for `name`, or undefined when the container no longer exists. */
async function containerState(
  name: string
): Promise<ContainerState | undefined> {
  const inspected = await docker([
    "inspect",
    "--format",
    "{{json .State}}",
    name,
  ]).catch(() => undefined);

  if (inspected === undefined) return undefined;

  // SAFETY: `docker inspect --format '{{json .State}}'` prints the state object.
  return JSON.parse(inspected.stdout) as ContainerState;
}

/**
 * Docker's own account of a container that did not become ready: its state and
 * the tail of its logs. The containers are started without `--rm`, so both
 * survive an exit; that is what names the cause the old "did not become ready"
 * message hid.
 */
async function containerDiagnostics(
  name: string,
  state: ContainerState | undefined
): Promise<string> {
  const summary =
    state === undefined
      ? "inspect found no container (it may have been removed)"
      : `Status=${state.Status} ExitCode=${state.ExitCode} OOMKilled=${state.OOMKilled} Error=${JSON.stringify(state.Error)}`;

  const logs = await dockerText([
    "logs",
    "--tail",
    String(LOG_TAIL_LINES),
    name,
  ]);

  return `state: ${summary}\nlast ${LOG_TAIL_LINES} log lines:\n${logs.trimEnd()}`;
}

/**
 * Waits for `probe` to succeed, failing at once if the container exits.
 *
 * A container that has exited cannot become ready, so waiting out the deadline
 * only hides the reason behind a timeout it never reached. `probe` is trusted
 * once it succeeds: a single re-check after the loop raced Postgres's own
 * init-to-serving handover and threw on a database that was in fact ready. The
 * thrown error carries the container's Docker state and log tail either way.
 */
export async function waitForContainer(input: {
  readonly name: string;
  readonly timeoutMs: number;
  readonly failure: string;
  readonly probe: () => Promise<boolean>;
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;
  let exited: ContainerState | undefined;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    if (await input.probe()) return;

    const state = await containerState(input.name);

    if (isTerminal(state)) {
      exited = state;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, READINESS_POLL_MS));
  }
  /* eslint-enable no-await-in-loop */

  const state = exited ?? (await containerState(input.name));

  const cause = isTerminal(state)
    ? `the container ${state.Status} (exit code ${state.ExitCode}, OOMKilled ${state.OOMKilled})`
    : `it did not become ready within ${input.timeoutMs / 1000}s`;

  throw new Error(
    `${input.failure}: ${cause}\n${await containerDiagnostics(input.name, state)}`
  );
}

export type GeneratedTenantDeploy = {
  readonly compose: string;
  readonly envExample: string;
  readonly moduleInclude: string;
  readonly tenantConfigPath: string;
  readonly brandingSeedPath: string;
  readonly remove: () => Promise<void>;
};

const GENERATED_DEPLOY_FILES = [
  ".env.example",
  "branding.seed.json",
  "compose.yaml",
  "modules.txt",
  "realm.overrides.json",
  "tenant.yaml",
  "values.yaml",
] as const;

/** Materializes the actual Nx tenant-generator output and removes only its unique fixture. */
export async function generateTenantDeploy(
  slug: string
): Promise<GeneratedTenantDeploy> {
  const customerRoot = join(WORKSPACE_ROOT, "customers", slug);
  const deployRoot = join(customerRoot, "deploy");

  if (existsSync(customerRoot)) {
    throw new Error(`refusing to overwrite existing customer fixture ${slug}`);
  }

  const remove = async () => {
    /* eslint-disable no-await-in-loop */
    for (const name of GENERATED_DEPLOY_FILES) {
      await unlink(join(deployRoot, name)).catch(() => undefined);
    }
    /* eslint-enable no-await-in-loop */

    await rmdir(deployRoot).catch(() => undefined);
    await rmdir(customerRoot).catch(() => undefined);
  };

  try {
    await run(
      "pnpm",
      [
        "exec",
        "nx",
        "g",
        "@genie/generators:tenant-new",
        slug,
        "--firstAdministrators=admin@example.invalid",
        "--breakGlassEmail=break-glass@example.invalid",
        "--companyName=Smoke Test",
        "--productName=Smoke Test",
        "--defaultLocale=en",
        "--defaultTimeZone=UTC",
      ],
      { cwd: WORKSPACE_ROOT, maxBuffer: 16 * 1024 * 1024 }
    );

    return {
      compose: readFileSync(join(deployRoot, "compose.yaml"), "utf8"),
      envExample: readFileSync(join(deployRoot, ".env.example"), "utf8"),
      moduleInclude: readFileSync(join(deployRoot, "modules.txt"), "utf8")
        .split("\n")
        .filter((id) => id !== "")
        .join(","),
      tenantConfigPath: join(deployRoot, "tenant.yaml"),
      brandingSeedPath: join(deployRoot, "branding.seed.json"),
      remove,
    };
  } catch (error) {
    await remove();

    throw error;
  }
}

async function ensureNetwork(name: string): Promise<boolean> {
  try {
    await docker(["network", "inspect", name]);

    return false;
  } catch {
    await docker(["network", "create", name]);

    return true;
  }
}

/**
 * The `.env` an operator writes: every name `.env.example` lists, with defaults preserved unless
 * the test fills them. Explicit test values may add names absent from the example, such as
 * Keycloak bootstrap credentials; the render test independently catches omissions in the
 * operator-facing example.
 */
function envValues(
  example: string,
  filled: Readonly<Record<string, string>>
): string {
  const values = new Map<string, string>();

  for (const line of example.split("\n")) {
    const match = /^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);

    if (match?.[1] !== undefined) {
      values.set(match[1], filled[match[1]] ?? match[2] ?? "");
    }
  }

  for (const [name, value] of Object.entries(filled)) {
    if (!values.has(name)) values.set(name, value);
  }

  return [...values]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
}

export type GeneratedStack = {
  readonly databaseName: string;
  readonly projectName: string;
  readonly slug: string;
  readonly request: (path: string) => Promise<Response>;
  readonly tableNames: () => Promise<readonly string[]>;
  /** Fetches `url` from inside the app container, so compose aliases resolve. */
  readonly requestFromApp: (url: string) => Promise<Response>;
  readonly serviceState: (service: string) => Promise<ServiceState>;
  /** Runs `genie-ops setup` in the running app container with the generated files. */
  readonly runSetup: () => Promise<CommandResult>;
  readonly stop: () => Promise<void>;
};

export type ServiceState = {
  readonly running: boolean;
  /** Docker's health status, or undefined for a service without a health check. */
  readonly health: string | undefined;
};

/** Runs a generated customer compose file against Postgres supplied on its external proxy network. */
export async function startGeneratedStack(input: {
  readonly slug: string;
  readonly imageTag: string;
  readonly compose: string;
  readonly envExample: string;
  readonly tenantConfigPath: string;
  readonly brandingSeedPath: string;
  readonly databasePassword: string;
  /** Values the test fills in for names `.env.example` lists. */
  readonly filled: Readonly<Record<string, string>>;
}): Promise<GeneratedStack> {
  const projectName = scopedProject("genie-generated-stack");
  const databaseName = `${input.slug}-database`;
  const databaseAlias = `${input.slug}-postgres`;
  const composeNetwork = `${projectName}_default`;
  const directory = await mkdtemp(join(tmpdir(), "genie-generated-stack-"));
  const composePath = join(directory, "compose.yaml");
  const envPath = join(directory, ".env");
  let networkCreated = false;
  let composeNetworkCreated = false;
  let databaseStarted = false;
  let composeStarted = false;

  const composeCommand = async (args: readonly string[]) =>
    docker([
      "compose",
      "--project-name",
      projectName,
      "--file",
      composePath,
      "--env-file",
      envPath,
      ...args,
    ]);

  const stop = async () => {
    if (composeStarted) {
      await composeCommand(["down", "--volumes", "--remove-orphans"]).catch(
        () => undefined
      );
    }

    if (databaseStarted) {
      await docker(["rm", "--force", databaseName]).catch(() => undefined);
    }

    if (networkCreated) {
      await docker(["network", "rm", PROXY_NETWORK]).catch(() => undefined);
    }

    if (composeNetworkCreated) {
      await docker(["network", "rm", composeNetwork]).catch(() => undefined);
    }

    await rm(directory, { recursive: true, force: true });
  };

  try {
    await writeFile(composePath, input.compose);
    await writeFile(
      envPath,
      envValues(input.envExample, {
        ...input.filled,
        DATABASE_URL: `postgres://genie:${input.databasePassword}@${databaseAlias}:5432/genie`,
        IMAGE_TAG: input.imageTag,
      })
    );

    networkCreated = await ensureNetwork(PROXY_NETWORK);
    composeNetworkCreated = await ensureNetwork(composeNetwork);

    await docker([
      "run",
      "--detach",
      "--name",
      databaseName,
      "--network",
      PROXY_NETWORK,
      "--network-alias",
      databaseAlias,
      "--env",
      "POSTGRES_USER=genie",
      "--env",
      `POSTGRES_PASSWORD=${input.databasePassword}`,
      "--env",
      "POSTGRES_DB=genie",
      POSTGRES_IMAGE,
    ]);
    databaseStarted = true;
    await docker([
      "network",
      "connect",
      "--alias",
      databaseAlias,
      composeNetwork,
      databaseName,
    ]);

    // The official image runs a temporary init server that listens only on the
    // Unix socket, so a socket `pg_isready` succeeds while the real server has
    // not started; the next probe then lands in the init-to-serving gap and
    // fails. Probe TCP on loopback, which only the real server binds, and that
    // is the address the app reaches over the compose network.
    await waitForContainer({
      name: databaseName,
      timeoutMs: READINESS_TIMEOUT_MS,
      failure: `Postgres ${databaseName} did not become ready`,
      probe: () =>
        succeeded([
          "exec",
          databaseName,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-p",
          "5432",
          "-U",
          "genie",
        ]),
    });

    // The production Keycloak profile has its own database on the host-supplied
    // Postgres instance, alongside the application database. `pg_isready` can
    // report success during Postgres recovery, so wait for `createdb` itself.
    await waitForContainer({
      name: databaseName,
      timeoutMs: READINESS_TIMEOUT_MS,
      failure: `Keycloak database was not created in ${databaseName}`,
      probe: async () => {
        const created = await succeeded([
          "exec",
          databaseName,
          "createdb",
          "-U",
          "genie",
          "keycloak",
        ]);

        if (created) return true;

        return docker([
          "exec",
          databaseName,
          "psql",
          "-U",
          "genie",
          "-d",
          "genie",
          "--no-psqlrc",
          "--tuples-only",
          "--no-align",
          "--command",
          "select 1 from pg_database where datname = 'keycloak'",
        ]).then(
          ({ stdout }) => stdout.trim() === "1",
          () => false
        );
      },
    });

    composeStarted = true;
    await composeCommand(["up", "--detach"]);

    const requestFromApp = async (url: string): Promise<Response> => {
      const result = await composeCommand([
        "exec",
        "--no-TTY",
        "app",
        "node",
        "-e",
        `fetch(${JSON.stringify(url)}, { redirect: "manual" }).then(async response => console.log(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }))).catch(error => { console.error(error); process.exitCode = 1; })`,
      ]);

      // SAFETY: the app-side probe serializes this exact response shape as JSON.
      const parsed = JSON.parse(
        result.stdout.trim().split("\n").at(-1) ?? ""
      ) as {
        readonly status: number;
        readonly headers: Record<string, string>;
        readonly body: string;
      };

      return new Response(parsed.body, {
        status: parsed.status,
        headers: parsed.headers,
      });
    };

    const request = async (path: string) =>
      requestFromApp(`http://127.0.0.1:3000${path}`);

    const serviceState = async (service: string): Promise<ServiceState> => {
      const { stdout } = await composeCommand([
        "ps",
        "--all",
        "--quiet",
        service,
      ]);

      const id = stdout.trim();

      if (id === "") return { running: false, health: undefined };

      const inspected = await docker([
        "inspect",
        "--format",
        "{{json .State}}",
        id,
      ]);

      // SAFETY: `docker inspect --format '{{json .State}}'` prints the container state object.
      const state = JSON.parse(inspected.stdout) as {
        readonly Running: boolean;
        readonly Health?: { readonly Status: string };
      };

      return { running: state.Running, health: state.Health?.Status };
    };

    const runSetup = async (): Promise<CommandResult> => {
      await composeCommand([
        "cp",
        input.tenantConfigPath,
        "app:/tmp/tenant.yaml",
      ]);
      await composeCommand([
        "cp",
        input.brandingSeedPath,
        "app:/tmp/branding.seed.json",
      ]);

      // The realm step signs in to the bundled Keycloak with the one-run bootstrap
      // credential and fills the two client secrets. These reach the setup command
      // only, never the app service environment (DEC-37, Spec 2 R-53).
      return composeCommand([
        "exec",
        "--no-TTY",
        "-e",
        `KEYCLOAK_URL=http://${input.slug}-keycloak:8080`,
        "-e",
        `KEYCLOAK_REALM=${SMOKE_REALM}`,
        "-e",
        `KEYCLOAK_BOOTSTRAP_USER=${input.filled.KC_BOOTSTRAP_ADMIN_USERNAME ?? ""}`,
        "-e",
        `KEYCLOAK_BOOTSTRAP_PASSWORD=${input.filled.KC_BOOTSTRAP_ADMIN_PASSWORD ?? ""}`,
        "-e",
        `KEYCLOAK_CLIENT_SECRET=${input.filled.KEYCLOAK_CLIENT_SECRET ?? ""}`,
        "-e",
        `KEYCLOAK_ADMIN_CLIENT_SECRET=${input.filled.KEYCLOAK_ADMIN_CLIENT_SECRET ?? ""}`,
        "app",
        "genie-ops",
        "setup",
        "--tenant-config",
        "/tmp/tenant.yaml",
        "--branding-seed",
        "/tmp/branding.seed.json",
      ]);
    };

    const databaseCommand = async (sql: string) =>
      docker([
        "exec",
        databaseName,
        "psql",
        "-U",
        "genie",
        "-d",
        "genie",
        "--no-psqlrc",
        "--tuples-only",
        "--no-align",
        "--command",
        sql,
      ]);

    return {
      databaseName,
      projectName,
      slug: input.slug,
      request,
      tableNames: async () => {
        const result = await databaseCommand(
          "select table_name from information_schema.tables where table_schema not in ('information_schema', 'pg_catalog') and table_type = 'BASE TABLE' order by table_name"
        );

        return result.stdout
          .split("\n")
          .map((name) => name.trim())
          .filter((name) => name !== "");
      },
      requestFromApp,
      serviceState,
      runSetup,
      stop,
    };
  } catch (error) {
    await stop();

    throw error;
  }
}

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const PROXY_NETWORK = "proxy";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

const POSTGRES_IMAGE = "postgres:18-alpine";

type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

async function docker(args: readonly string[]): Promise<CommandResult> {
  return run("docker", [...args], { maxBuffer: 16 * 1024 * 1024 });
}

export type GeneratedTenantDeploy = {
  readonly compose: string;
  readonly envExample: string;
  readonly moduleInclude: string;
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

function envValues(
  example: string,
  compose: string,
  overrides: Readonly<Record<string, string>>
): string {
  const values = new Map<string, string>();

  for (const line of example.split("\n")) {
    const match = /^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);

    if (match?.[1] !== undefined) {
      values.set(match[1], match[2] ?? "");
    }
  }

  for (const [name, value] of Object.entries(overrides)) {
    values.set(name, value);
  }

  for (const [, name] of compose.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?[^}]*\}/g)) {
    if (name === undefined || (values.get(name) ?? "") !== "") continue;

    const value = name.endsWith("URL")
      ? "https://example.invalid"
      : `smoke-${name.toLowerCase()}`;

    values.set(name, value);
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
  readonly markSetupDone: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

/** Runs a generated customer compose file against Postgres supplied on its external proxy network. */
export async function startGeneratedStack(input: {
  readonly slug: string;
  readonly imageTag: string;
  readonly compose: string;
  readonly envExample: string;
}): Promise<GeneratedStack> {
  const projectName = input.slug;
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
      envValues(input.envExample, input.compose, {
        DATABASE_URL: `postgres://genie:genie@${databaseAlias}:5432/genie`,
        // TODO: Remove when the Section 0 template switches to IMAGE_TAG.
        GENIE_IMAGE: input.imageTag,
        IMAGE_TAG: input.imageTag,
        PUBLIC_URL: "https://example.invalid",
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
      "POSTGRES_PASSWORD=genie",
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

    const databaseDeadline = Date.now() + 60000;

    /* eslint-disable no-await-in-loop */
    while (Date.now() < databaseDeadline) {
      const ready = await docker([
        "exec",
        databaseName,
        "pg_isready",
        "-U",
        "genie",
      ])
        .then(() => true)
        .catch(() => false);

      if (ready) break;

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    /* eslint-enable no-await-in-loop */

    const ready = await docker([
      "exec",
      databaseName,
      "pg_isready",
      "-U",
      "genie",
    ])
      .then(() => true)
      .catch(() => false);

    if (!ready)
      throw new Error(`Postgres ${databaseName} did not become ready`);

    composeStarted = true;
    await composeCommand(["up", "--detach", "--no-deps", "app"]);

    const request = async (path: string): Promise<Response> => {
      const result = await composeCommand([
        "exec",
        "--no-TTY",
        "app",
        "node",
        "-e",
        `fetch("http://127.0.0.1:3000${path}", { redirect: "manual" }).then(async response => console.log(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }))).catch(error => { console.error(error); process.exitCode = 1; })`,
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
      markSetupDone: async () => {
        await databaseCommand(
          "insert into setup_step (step, state) values ('migrations', 'done'), ('seed', 'done') on conflict (step) do update set state = 'done', detail = null, updated_at = now()"
        );
      },
      stop,
    };
  } catch (error) {
    await stop();

    throw error;
  }
}

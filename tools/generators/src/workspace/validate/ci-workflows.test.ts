import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

const WORKFLOWS = ".github/workflows";

function read(relative: string): string {
  const path = join(WORKSPACE_ROOT, relative);

  if (!existsSync(path)) {
    throw new Error(`missing ${relative}`);
  }

  return readFileSync(path, "utf8");
}

/** Every workflow file, repository-relative, so a new one is checked without a list edit. */
function workflowFiles(): readonly string[] {
  return readdirSync(join(WORKSPACE_ROOT, WORKFLOWS))
    .filter((name) => /\.ya?ml$/.test(name))
    .toSorted()
    .map((name) => `${WORKFLOWS}/${name}`);
}

/**
 * The shell text of every `run:` step: the inline value, or the indented block
 * under `run: |`. This is what the runner hands to the shell.
 */
function runScripts(workflow: string): readonly string[] {
  const lines = workflow.split("\n");
  const scripts: string[] = [];

  for (const [index, line] of lines.entries()) {
    const run = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);

    if (run === null) continue;

    const [, indent = "", inline = ""] = run;

    if (!/^[|>]/.test(inline)) {
      scripts.push(inline);

      continue;
    }

    const block: string[] = [];

    for (const next of lines.slice(index + 1)) {
      if (next.trim() !== "" && next.search(/\S/) <= indent.length) break;

      block.push(next);
    }

    scripts.push(block.join("\n"));
  }

  return scripts;
}

/** The `actions/checkout` steps of a workflow, each with the lines under it. */
function checkoutSteps(workflow: string): readonly string[] {
  return workflow
    .split(/^(?=\s*- )/m)
    .filter((step) => /^\s*- uses: actions\/checkout@/.test(step));
}

type RootScripts = { readonly scripts?: Readonly<Record<string, string>> };

function rootScript(name: string): string {
  // SAFETY: the root manifest is this repository's own package.json; the two
  // fields read are checked for presence below.
  const manifest = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf8")
  ) as RootScripts;

  const script = manifest.scripts?.[name];

  if (script === undefined) throw new Error(`no root script ${name}`);

  return script;
}

/**
 * R-51's CI gates, held as a wiring check.
 *
 * The workflows cannot be executed here, so this asserts the exact triggers and
 * commands they must carry, and — the part that matters most — that no workflow
 * contains a bare `docker push`. Every publish goes through the customer or
 * development wrapper, which is the only place that smoke-checks the candidate
 * and pushes the exact smoke-tested identity.
 */
describe("the Spec 0 CI gates", () => {
  it("runs the pull-request gates on every pull request", () => {
    const workflow = read(`${WORKFLOWS}/pull-request.yml`);

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("pnpm run ci:pr");
  });

  it("runs the merge gates on develop, based on the pushed commit's parent", () => {
    const workflow = read(`${WORKFLOWS}/develop.yml`);

    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- develop");
    expect(workflow).toContain("pnpm run ci:develop");
    // `origin/develop` is HEAD on a develop push, so the base must be the
    // pushed commit's parent, with the all-zero first push falling back.
    expect(workflow).toContain("github.event.before");
    expect(workflow).toContain("NX_BASE");
    expect(workflow).toContain("0000000000000000000000000000000000000000");
    // The all-zero first push has no parent; basing it on `origin/develop` (which
    // is HEAD) would be an empty range, so it uses git's empty tree instead.
    expect(workflow).toContain("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });

  it("builds one image per customer and falls back to the development image", () => {
    const workflow = read(`${WORKFLOWS}/release.yml`);

    expect(workflow).toContain("tags:");
    expect(workflow).toContain('- "v*"');
    expect(workflow).toContain("scripts/build-customer-image.sh");
    expect(workflow).toContain("scripts/build-development-image.sh");
    expect(workflow).toContain("--publish");
    expect(workflow).toContain("docker/login-action");
    expect(workflow).toContain("secrets.GITHUB_TOKEN");
    // The development fallback is the branch taken when no customer exists.
    expect(workflow).toContain("needs.discover.outputs.customers == '[]'");
  });

  // The repository's default workflow token is read-only, so a job that logs in
  // to the registry must ask for `packages: write` itself, and nothing else may
  // ask for write (genie-ops-center-v2-0lj).
  it("grants package write only to the jobs that log in to the registry", () => {
    const workflow = read(`${WORKFLOWS}/release.yml`);

    const [head = "", body = ""] = workflow.split(/^jobs:\n/m);

    const jobs = body
      .split(/^(?= {2}[\w-]+:\n)/m)
      .filter((job) => job.trim() !== "");

    const publishing = jobs.filter((job) =>
      job.includes("docker/login-action")
    );

    expect(head).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(publishing.length).toBeGreaterThan(1);

    for (const job of publishing) {
      expect(job, job.split("\n")[0]).toContain("      packages: write\n");
    }

    for (const job of jobs.filter(
      (candidate) => !publishing.includes(candidate)
    )) {
      expect(job, job.split("\n")[0]).not.toContain("write");
    }

    const grants = workflow
      .split("\n")
      .filter((line) => /:\s*write\s*$/.test(line));

    expect(grants.every((line) => line.trim() === "packages: write")).toBe(
      true
    );
  });

  // Least privilege: every workflow starts read-only, so a new job cannot
  // inherit a write token by accident. Only the release publishing jobs write.
  it("declares read-only top-level permissions in every workflow", () => {
    const files = workflowFiles();

    expect(files.length).toBeGreaterThan(2);

    for (const file of files) {
      const workflow = read(file);
      const [head = ""] = workflow.split(/^jobs:\n/m);

      expect(head, file).toMatch(/^permissions:\n {2}contents: read\n/m);

      if (!file.endsWith("/release.yml")) {
        expect(workflow, file).not.toMatch(/:\s*write\s*$/m);
      }
    }
  });

  // Script injection: an expression expanded into `run:` text is pasted into
  // the shell before it runs, so a crafted tag name could execute. Values reach
  // the shell through `env:` and are quoted there as ordinary variables.
  it("expands no github or matrix expression inside a run script", () => {
    for (const file of workflowFiles()) {
      for (const script of runScripts(read(file))) {
        expect(script, file).not.toMatch(/\$\{\{\s*(github|matrix)\./);
      }
    }
  });

  // The publishing jobs hold a packages:write token; a persisted checkout
  // credential would sit in .git/config through every gate and build.
  it("persists no checkout credential in the release workflow", () => {
    const steps = checkoutSteps(read(`${WORKFLOWS}/release.yml`));

    expect(steps.length).toBeGreaterThan(2);

    for (const step of steps) {
      expect(step).toMatch(/^\s+persist-credentials: false$/m);
    }
  });

  // A hosted runner has no browser. Storybook component tests and the E2E suites
  // launch Chromium, so every job that runs gates installs the pinned browser after
  // the dependencies and before the gates (genie-ops-center-v2-1rd.12.2).
  it("installs the pinned Playwright Chromium before any gate runs", () => {
    const gate = /run: (pnpm run ci:|scripts\/build-)|^\s+run: scripts\/build-/;

    for (const name of ["pull-request", "develop", "release"]) {
      const lines = read(`${WORKFLOWS}/${name}.yml`).split("\n");

      const gates = lines.flatMap((line, index) =>
        gate.test(line) ? [index] : []
      );

      expect(gates.length, name).toBeGreaterThan(0);

      for (const at of gates) {
        const before = lines.slice(0, at);

        const install = before.findLastIndex((line) =>
          line.includes("pnpm install --frozen-lockfile")
        );

        const browser = before.findLastIndex((line) =>
          line.includes("pnpm exec playwright install --with-deps chromium")
        );

        expect(
          install,
          `${name}:${at + 1} installs dependencies`
        ).toBeGreaterThan(-1);
        expect(
          browser,
          `${name}:${at + 1} installs the browser after the dependencies`
        ).toBeGreaterThan(install);
      }
    }
  });

  // The image suites build many full app images on one hosted runner, and the
  // default runner ran out of disk inside `pnpm install` (release run
  // 35865015903). Every job that runs gates frees the preinstalled toolchains
  // first (genie-ops-center-v2-1rd.12.2).
  it("frees runner disk space before any gate runs", () => {
    const gate = /run: (pnpm run ci:|scripts\/build-)|^\s+run: scripts\/build-/;

    for (const name of ["pull-request", "develop", "release"]) {
      const lines = read(`${WORKFLOWS}/${name}.yml`).split("\n");

      const gates = lines.flatMap((line, index) =>
        gate.test(line) ? [index] : []
      );

      expect(gates.length, name).toBeGreaterThan(0);

      for (const at of gates) {
        const job = lines.slice(0, at);

        const start = job.findLastIndex((line) => /^ {2}[\w-]+:$/.test(line));

        const freed = job
          .slice(start)
          .some((line) =>
            line.includes(
              "rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc"
            )
          );

        expect(freed, `${name}:${at + 1} frees disk space in its job`).toBe(
          true
        );
      }
    }
  });

  // Without a limit a hung job runs to GitHub's six-hour default. Every job states
  // its own ceiling, so a hang fails clearly within a bounded time.
  it("bounds every job with its own timeout", () => {
    for (const name of ["pull-request", "develop", "release"]) {
      const lines = read(`${WORKFLOWS}/${name}.yml`).split("\n");

      const body = lines.slice(lines.findIndex((line) => line === "jobs:") + 1);

      const starts = body.flatMap((line, index) =>
        /^ {2}[\w-]+:$/.test(line) ? [index] : []
      );

      expect(starts.length, name).toBeGreaterThan(0);

      for (const [position, start] of starts.entries()) {
        const job = body.slice(start, starts[position + 1] ?? body.length);

        expect(
          job.some((line) => /^ {4}timeout-minutes: \d+$/.test(line)),
          `${name} ${job[0]?.trim()} declares timeout-minutes`
        ).toBe(true);
      }
    }
  });

  it("never pushes an image except through the smoke-then-publish wrapper", () => {
    for (const name of ["pull-request", "develop", "release"]) {
      expect(read(`${WORKFLOWS}/${name}.yml`)).not.toContain("docker push");
    }

    // The wrapper itself is the one place that pushes, and it reads the
    // customer's modules.txt, builds, smoke-tests and only then publishes.
    const customer = read("scripts/build-customer-image.sh");

    expect(customer).toContain("cli.ts");
  });

  it("wires the root scripts the workflows call", () => {
    const pr = rootScript("ci:pr");

    for (const target of [
      "lint",
      "typecheck",
      "test",
      "build-storybook",
      "test-storybook",
      "test:integration",
    ]) {
      expect(pr, `ci:pr must run ${target}`).toContain(target);
    }

    expect(pr).toContain("validate");

    // The integration tasks run in parallel. Without bail, Nx waits for every
    // sibling after one fails, so a slow or stalled sibling kept ci:develop
    // silent for 14 minutes after a failure (develop run 35867486208).
    const integration = pr
      .split("&&")
      .find((segment) => segment.includes("test:integration"));

    expect(integration).toContain("--nx-bail");
    expect(rootScript("ci:develop")).toContain("test:e2e:fixture");
    expect(rootScript("ci:release:customer")).toContain(
      "scripts/build-customer-image.sh"
    );
    expect(rootScript("ci:release:development")).toContain(
      "scripts/build-development-image.sh"
    );
  });

  // What `--nx-bail` does is Nx behavior, so it is proved against the installed
  // Nx rather than assumed: one task fails, and its running sibling, including
  // a background grandchild, is stopped rather than awaited.
  it("bail stops a running sibling and its children once one task fails", () => {
    const stage = mkdtempSync(join(tmpdir(), "genie-nx-bail-"));

    try {
      symlinkSync(
        join(WORKSPACE_ROOT, "node_modules"),
        join(stage, "node_modules")
      );
      writeFileSync(
        join(stage, "nx.json"),
        JSON.stringify({ neverConnectToCloud: true, parallel: 2 })
      );
      writeFileSync(
        join(stage, "package.json"),
        JSON.stringify({ name: "stage", private: true, workspaces: ["a", "b"] })
      );

      const project = (name: string, script: string) => {
        mkdirSync(join(stage, name));
        writeFileSync(
          join(stage, name, "package.json"),
          JSON.stringify({ name, scripts: { t: script } })
        );
      };

      project("a", "sleep 2; exit 1");
      project("b", "sleep 120 & echo $! > ../grandchild.pid; sleep 120");

      const started = Date.now();

      const result = spawnSync(
        join(stage, "node_modules/.bin/nx"),
        ["run-many", "-t", "t", "--nx-bail"],
        {
          cwd: stage,
          encoding: "utf8",
          env: { ...process.env, NX_DAEMON: "false", CI: "true" },
          // A missing bail would wait the full 120 seconds; this bound turns
          // that into a failure below instead of a stalled suite.
          timeout: 60000,
        }
      );

      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.status).not.toBeNull();
      expect(Date.now() - started).toBeLessThan(30000);

      const grandchild = Number(
        readFileSync(join(stage, "grandchild.pid"), "utf8")
      );

      expect(() => process.kill(grandchild, 0)).toThrow();
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }, 90000);

  it("runs the ordinary app E2E suite on develop beside the fixture suite", () => {
    const develop = rootScript("ci:develop");

    // A bare `test:e2e` substring would also match `test:e2e:fixture`.
    expect(develop).toMatch(/@genie\/app:test:e2e(?![\w:-])/);
    expect(develop).toContain("@genie/app:test:e2e:fixture");

    // SAFETY: the app manifest is this repository's own file.
    const app = JSON.parse(read("apps/genie/package.json")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };

    expect(app.scripts["test:e2e"]).toContain(
      "--config apps/genie/playwright.config.ts"
    );

    const config = read("apps/genie/playwright.config.ts");

    expect(config).toContain('name: "phone"');
    expect(config).toContain('name: "desktop"');
  });

  it("tracks the workflow and generator inputs the validate target reads", () => {
    // SAFETY: nx.json is this repository's own configuration.
    const config = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "nx.json"), "utf8")
    ) as {
      readonly namedInputs: {
        readonly default: readonly string[];
        readonly sharedGlobals: readonly string[];
      };
      readonly targetDefaults: {
        readonly validate: { readonly inputs: readonly string[] };
      };
    };

    const inputs = config.targetDefaults.validate.inputs;

    // The clean-checkout registry check shells out to the app generator, and
    // the module-has-tests and README checks read module packages; both must be
    // real inputs or a change can restore a stale validate result.
    expect(inputs).toContain("{workspaceRoot}/apps/genie/tools/**/*");
    expect(inputs).toContain("{workspaceRoot}/packages/modules/**/*");
    expect(inputs).toContain("{workspaceRoot}/.github/**");
  });
});

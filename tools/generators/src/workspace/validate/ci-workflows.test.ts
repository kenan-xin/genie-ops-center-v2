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

/** The jobs of a workflow, keyed by job id, each with its full YAML text. */
function jobsOf(workflow: string): ReadonlyMap<string, string> {
  const body = workflow.split(/^jobs:\n/m)[1] ?? "";

  return new Map(
    body
      .split(/^(?= {2}[\w-]+:\n)/m)
      .filter((job) => job.trim() !== "")
      .map((job) => {
        const name =
          /^ {2}([\w-]+):$/.exec(job.split("\n")[0] ?? "")?.[1] ?? "";

        return [name, job] as const;
      })
  );
}

/** A whole-target pattern: `test` must not match inside `test:integration`. */
function targetPattern(name: string): RegExp {
  return new RegExp(`(?<![\\w:-])${name}(?![\\w:-])`);
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
    // The serial `pnpm run ci:develop` monolith is gone from the workflow; the
    // parallel jobs below carry its targets (genie-ops-center-v2-ejs).
    expect(workflow).not.toContain("pnpm run ci:develop");
    // `origin/develop` is HEAD on a develop push, so the base must be the
    // pushed commit's parent, with the all-zero first push falling back.
    expect(workflow).toContain("github.event.before");
    expect(workflow).toContain("NX_BASE");
    expect(workflow).toContain("0000000000000000000000000000000000000000");
    // The all-zero first push has no parent; basing it on `origin/develop` (which
    // is HEAD) would be an empty range, so it uses git's empty tree instead.
    expect(workflow).toContain("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });

  // One runner per heavy suite. Today's single verify job serializes the fast
  // gates behind the image-building integration suites and the browser E2E
  // suites, so a merge commit waits for the slowest chain
  // (genie-ops-center-v2-ejs). The gates keep one job; the app and Storybook
  // integration suites each get their own runner — on one 4-vCPU runner the
  // app's Docker builds competed with the Storybook browser matrix (develop
  // run 35893905134) — and the E2E suites get theirs. Requiring each heavy job
  // to `needs: gates` is accepted here: the gates fail fast before any heavy
  // suite spends runner time, and the heavy suites still run beside each other.
  it("splits the develop merge gates into parallel jobs", () => {
    const workflow = read(`${WORKFLOWS}/develop.yml`);
    const jobs = jobsOf(workflow);

    // No develop job runs the serial monolith scripts any more; ci:pr stays
    // the pull-request path only.
    expect(workflow).not.toContain("pnpm run ci:develop");
    expect(workflow).not.toContain("pnpm run ci:pr");

    const gates = jobs.get("gates");

    expect(gates, "a gates job").toBeDefined();

    for (const target of [
      "lint",
      "typecheck",
      "test",
      "build",
      "build-storybook",
      "test-storybook",
      "validate",
    ]) {
      expect(gates, `the gates job runs ${target}`).toMatch(
        targetPattern(target)
      );
    }

    // The gates job stays fast: no image suite, no browser suite.
    expect(gates).not.toMatch(/test:integration|test:e2e/);

    const integrationJobs = [...jobs.entries()].filter(([, job]) =>
      job.includes("test:integration")
    );

    expect(
      integrationJobs.length,
      "the heavy suites split across jobs"
    ).toBeGreaterThanOrEqual(2);

    const appJob = integrationJobs.find(([, job]) =>
      job.includes("@genie/app")
    );

    const storybookJob = integrationJobs.find(([, job]) =>
      job.includes("@genie/storybook")
    );

    expect(appJob, "a job runs the app integration suite").toBeDefined();
    expect(
      storybookJob,
      "a job runs the Storybook integration suite"
    ).toBeDefined();
    expect(appJob?.[0], "the two suites run on different runners").not.toBe(
      storybookJob?.[0]
    );

    const e2eJob = [...jobs.entries()].find(([, job]) =>
      job.includes("test:e2e")
    );

    expect(e2eJob, "a job runs the E2E suites").toBeDefined();

    // The fixture stack precedes the ordinary suite, as ci:develop runs them.
    const e2eScripts = runScripts(e2eJob?.[1] ?? "").join("\n");
    const fixtureAt = e2eScripts.search(targetPattern("test:e2e:fixture"));
    const ordinaryAt = e2eScripts.search(targetPattern("test:e2e"));

    expect(fixtureAt, "the E2E job runs the fixture suite").toBeGreaterThan(-1);
    expect(
      ordinaryAt,
      "the E2E job runs the ordinary suite after the fixture"
    ).toBeGreaterThan(fixtureAt);

    // Every heavy job waits for the gates, so a broken lint fails before any
    // image build spends runner time.
    const heavyJobs = [...integrationJobs, ...(e2eJob ? [e2eJob] : [])];

    for (const [name, job] of heavyJobs) {
      expect(job, `${name} waits for the gates`).toMatch(
        /^ {4}needs:(?: gates| \[gates\]|\n {6}- gates)\n/m
      );
    }
  });

  // Splitting must not drop targets: the union of the develop jobs still runs
  // everything ci:develop runs today — the ci:pr gates and validate, the
  // integration target, and both E2E suites — so no gate silently leaves CI.
  it("covers every ci:develop target across the develop jobs", () => {
    const scripts = [...jobsOf(read(`${WORKFLOWS}/develop.yml`)).values()]
      .flatMap(runScripts)
      .join("\n");

    for (const target of [
      "lint",
      "typecheck",
      "test",
      "build",
      "build-storybook",
      "test-storybook",
      "test:integration",
      "validate",
      "test:e2e:fixture",
      "test:e2e",
    ]) {
      expect(scripts, `the develop jobs run ${target}`).toMatch(
        targetPattern(target)
      );
    }
  });

  // Each split job is a hosted runner of its own, so the guardrails the single
  // job carried must be carried again per job: ubuntu-latest (the owner kept
  // every job on the standard image), a runtime bound, a credential-free
  // checkout, the disk cleanup where images build, a bail on multi-project
  // integration runs, and the parent-commit base for every affected run.
  it("carries the runner guardrails into every develop job", () => {
    for (const [name, job] of jobsOf(read(`${WORKFLOWS}/develop.yml`))) {
      expect(job, `${name} stays on ubuntu-latest`).toMatch(
        /^ {4}runs-on: ubuntu-latest$/m
      );
      expect(job, `${name} declares timeout-minutes`).toMatch(
        /^ {4}timeout-minutes: \d+$/m
      );

      for (const step of checkoutSteps(job)) {
        expect(step, `${name} persists no checkout credential`).toMatch(
          /^\s+persist-credentials: false$/m
        );
      }

      const scripts = runScripts(job).join("\n");

      // The integration and E2E suites build full Docker images (build-image,
      // build-fixture-image); each image-building job frees the runner's
      // preinstalled toolchains first or runs out of disk (release run
      // 35865015903). The gates job builds no image and needs none of this.
      if (/test:integration|test:e2e/.test(scripts)) {
        expect(scripts, `${name} frees runner disk space`).toContain(
          "rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc"
        );
      }

      // Several integration projects sharing one runner run one at a time —
      // the 4-vCPU competition that forced --parallel=1 on ci:pr — and a bail
      // stops the remaining projects once one fails (develop run 35867486208).
      const projects = new Set(
        runScripts(job)
          .filter((script) => script.includes("test:integration"))
          .flatMap((script) => script.match(/@[\w-]+\/[\w-]+/g) ?? [])
      );

      if (projects.size > 1) {
        expect(
          scripts,
          `${name} bails its multi-project integration run`
        ).toContain("--nx-bail");
      }

      // An affected run on a develop push bases its range on the pushed
      // commit's parent; every affected job wires that base itself.
      if (scripts.includes("nx affected")) {
        expect(job, `${name} wires the affected base`).toContain("NX_BASE");
      }
    }
  });

  // Affected filtering: a push that touches no project must run no heavy
  // suite, so every develop integration job filters its project through
  // `nx affected` based on the pushed commit's parent — an unconditional
  // `nx run-many` runs every suite on every push (reviewed on 57bfc26). On
  // Nx 23.2.1, `nx affected -t test:integration --exclude='*,!@genie/app'
  // --base="$NX_BASE"` filters to one project. Each integration job wires the
  // same parent-commit base step the gates job carries, zero-SHA fallback
  // included.
  it("filters every develop integration job through the affected set", () => {
    for (const [name, job] of jobsOf(read(`${WORKFLOWS}/develop.yml`))) {
      const scripts = runScripts(job).join("\n");

      if (!scripts.includes("test:integration")) continue;

      expect(scripts, `${name} runs through nx affected`).toContain(
        "nx affected"
      );
      expect(
        scripts,
        `${name} never runs the suite unconditionally`
      ).not.toContain("nx run-many");
      expect(scripts, `${name} bases the affected range on NX_BASE`).toMatch(
        /--base=["{]?\$NX_BASE/
      );

      // The job carries the base step itself: the pushed commit's parent,
      // with the all-zero first push falling back.
      expect(job, `${name} reads the pushed commit's parent`).toContain(
        "github.event.before"
      );
      expect(job, `${name} keeps the zero-SHA fallback`).toContain(
        "0000000000000000000000000000000000000000"
      );
      expect(job, `${name} wires NX_BASE`).toContain("NX_BASE");
    }

    // The E2E job stays unconditional: ci:develop always ran both browser
    // suites regardless of the affected set, so the deployable image is
    // proved end to end on every merge.
    const e2eJob = jobsOf(read(`${WORKFLOWS}/develop.yml`)).get("e2e");

    expect(e2eJob, "an e2e job").toBeDefined();
    expect(
      e2eJob,
      "the e2e job never filters through the affected set"
    ).not.toContain("nx affected");
  });

  // Superseded runs: every push to an open pull request and every merge to
  // develop cancels the previous run on the same ref, so a burst of pushes
  // does not queue a wall of redundant runner hours (genie-ops-center-v2-ejs).
  it("cancels the superseded pull-request and develop runs", () => {
    for (const name of ["pull-request", "develop"]) {
      const workflow = read(`${WORKFLOWS}/${name}.yml`);
      const [head = ""] = workflow.split(/^jobs:\n/m);

      // Top-level, so it applies to every job the workflow declares.
      expect(head, `${name} declares a concurrency group`).toMatch(
        /^concurrency:\n/m
      );

      // The group carries a ref, so two branches never share a group, and a
      // workflow name — the expression or the workflow's own name — so the
      // two workflows on one pull request never cancel each other.
      const group = /^ {2}group: (.*)$/m.exec(head)?.[1] ?? "";

      expect(group, `${name} groups by ref`).toContain("github.ref");
      expect(
        /github\.workflow/.test(group) ||
          /[A-Za-z]/.test(group.replace(/\$\{\{[^}]*\}\}/g, "")),
        `${name} groups by workflow`
      ).toBe(true);

      expect(head, `${name} cancels in progress`).toMatch(
        /^ {2}cancel-in-progress: true$/m
      );
    }
  });

  // A release tag is never superseded: there is no newer tag run to cancel it
  // in favour of, and a cancelled publish could strand a half-pushed image.
  it("never cancels a release run", () => {
    const workflow = read(`${WORKFLOWS}/release.yml`);

    expect(workflow).not.toMatch(/cancel-in-progress:\s*true/);
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

    // pull-request and release keep one serial gate job each, so the install
    // still precedes that single gate.
    for (const name of ["pull-request", "release"]) {
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

    // develop splits into jobs, and every one of those jobs runs a gate that
    // launches the pinned Chromium on the host: test-storybook under the gates
    // and the Storybook integration suite, Playwright under the E2E suites.
    // Each such job installs the browser after its dependencies and before
    // its first gate.
    for (const [jobName, job] of jobsOf(read(`${WORKFLOWS}/develop.yml`))) {
      const scripts = runScripts(job).join("\n");

      if (!/test-storybook|test:e2e|test:integration/.test(scripts)) continue;

      const install = job.indexOf("pnpm install --frozen-lockfile");

      const browser = job.indexOf(
        "pnpm exec playwright install --with-deps chromium"
      );

      const firstGate = Math.min(
        ...[...job.matchAll(/run:.*\bnx (?:affected|run-many|run)\b/g)].map(
          (match) => match.index ?? 0
        )
      );

      expect(
        install,
        `develop ${jobName} installs dependencies`
      ).toBeGreaterThan(-1);
      expect(
        browser,
        `develop ${jobName} installs the browser after the dependencies`
      ).toBeGreaterThan(install);
      expect(
        browser,
        `develop ${jobName} installs the browser before its first gate`
      ).toBeLessThan(firstGate);
    }
  });

  // The image suites build many full app images on one hosted runner, and the
  // default runner ran out of disk inside `pnpm install` (release run
  // 35865015903). Every job that runs gates frees the preinstalled toolchains
  // first (genie-ops-center-v2-1rd.12.2).
  it("frees runner disk space before any gate runs", () => {
    const gate = /run: (pnpm run ci:|scripts\/build-)|^\s+run: scripts\/build-/;

    // pull-request and release keep one serial gate job each, so the cleanup
    // still precedes that single gate.
    for (const name of ["pull-request", "release"]) {
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

    // develop splits into jobs, and the disk-hungry ones — the integration
    // suites and the E2E suites, which build full Docker images (build-image,
    // build-fixture-image) — free the toolchains in their own job before the
    // builds start. The gates job builds no image and needs none of this.
    for (const [jobName, job] of jobsOf(read(`${WORKFLOWS}/develop.yml`))) {
      const scripts = runScripts(job).join("\n");

      if (!/test:integration|test:e2e/.test(scripts)) continue;

      const freed = job.indexOf(
        "rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc"
      );

      const firstGate = Math.min(
        ...[...job.matchAll(/run:.*\bnx (?:affected|run-many|run)\b/g)].map(
          (match) => match.index ?? 0
        )
      );

      expect(
        freed,
        `develop ${jobName} frees disk space in its job`
      ).toBeGreaterThan(-1);
      expect(
        freed,
        `develop ${jobName} frees disk space before its first build`
      ).toBeLessThan(firstGate);
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

    // Without bail, Nx waits for every sibling after one fails, so a slow or
    // stalled sibling kept ci:develop silent for 14 minutes after a failure
    // (develop run 35867486208).
    const integration = pr
      .split("&&")
      .find((segment) => segment.includes("test:integration"));

    expect(integration).toContain("--nx-bail");

    // The integration projects run one at a time. In parallel on a 4-vCPU
    // runner, the Storybook browser matrix competed with the app's Docker
    // image builds and failed on browser connect timeouts and the Vitest
    // import race (develop runs 35893905134 and 35932712679).
    expect(integration).toContain("--parallel=1");
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

  // Coverage is a local developer tool, never a gate. It has exactly one entry
  // point, the root `coverage` script, and no CI script or workflow may run it.
  it("keeps coverage local: one root script, and no CI gate runs it", () => {
    const coverage = rootScript("coverage");

    expect(coverage).toContain("nx run-many");
    expect(coverage).toContain("--coverage");

    // SAFETY: the root manifest is this repository's own package.json.
    const manifest = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf8")
    ) as RootScripts;

    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (name === "coverage") continue;

      expect(command, name).not.toContain("coverage");
    }

    for (const file of workflowFiles()) {
      expect(read(file), file).not.toContain("coverage");
    }
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

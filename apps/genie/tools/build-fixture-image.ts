import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Builds `genie-s005:fixture`, the disposable image carrying the failing,
 * invalid and permitted frame-origin fixture modules (AC-25).
 *
 * The repository is never touched. The script stages a build context under the
 * operating system's temporary directory — outside the repository's inventory —
 * copies the workspace into it, injects the fixture templates from
 * `tools/fixture-modules/` as ordinary module packages under the staged
 * `packages/modules/`, and regenerates the staged lockfile there. Each
 * invocation allocates its own uniquely named stage and never deletes anything
 * it did not itself create — a retained stage from an earlier run is left for
 * its owner, and Docker's content-addressed cache makes the path irrelevant to
 * build reuse.
 *
 * Retention policy: a SUCCESSFUL build deletes exactly its own stage — the
 * image is the artifact, the context was spent; a FAILED build retains its
 * stage at the printed path for inspection. Stages from earlier runs,
 * successful or not, are never touched.
 *
 * The production Dockerfile is used unchanged: it still installs with
 * `--frozen-lockfile`, and succeeds because the staged lockfile now names the
 * fixture packages. No repository file, selection, or lockfile changes, so the
 * default image and every other gate keep building exactly what they built
 * before.
 */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const FIXTURE_TAG = "genie-s005:fixture";

const FIXTURE_MODULES = [
  "failing-viewer",
  "invalid-viewer",
  "permitted-viewer",
] as const;

/** Directory names never staged: untracked build output, caches, and bulk docs. */
const PRUNED = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nx",
  ".turbo",
  ".beads",
  ".impeccable",
  ".storybook",
  "storybook-static",
  "test-results",
  "playwright-report",
  "dist",
  "coverage",
  "docs",
  "plans",
]);

let failed = false;

function run(
  step: string,
  command: string,
  args: readonly string[],
  cwd: string
): void {
  console.log(`[fixture-image] ${step}: ${command} ${args.join(" ")}`);

  const result = spawnSync(command, [...args], {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`[fixture-image] ${step} failed with exit ${result.status}.`);

    failed = true;
  }
}

// Each run stages into a fresh uniquely named directory, so the script can
// never delete a path it does not know it owns. Stages are retained; removing
// one is a separate, explicit decision about a path a run printed.
const STAGE = mkdtempSync(join(tmpdir(), "genie-s005-fixture-"));

console.log(`[fixture-image] staging the workspace into ${STAGE}`);

cpSync(REPO_ROOT, STAGE, {
  recursive: true,
  filter: (source) => {
    const name = source.split(/[\\/]/).pop() ?? "";

    return !PRUNED.has(name);
  },
});

for (const id of FIXTURE_MODULES) {
  const source = join(REPO_ROOT, "apps/genie/tools/fixture-modules", id);
  const target = join(STAGE, "packages/modules", id);

  if (!existsSync(join(source, "package.json"))) {
    console.error(`[fixture-image] missing fixture template: ${source}`);

    process.exit(1);
  }

  cpSync(source, target, { recursive: true });
}

// The staged app manifest, never the repository's one: the fixture packages
// become dependencies of the app inside the stage, so the container's frozen
// install links them into apps/genie/node_modules and the bundler can resolve
// the generated registry's imports. This is how @genie/module-placeholder is
// resolvable too, and no repository file or pin changes.
const stagedAppManifestPath = join(STAGE, "apps/genie/package.json");

// SAFETY: the manifest is the repository's own package.json, copied above; the
// one field mutated is `dependencies`, and only by adding the fixture packages.
const stagedAppManifest = JSON.parse(
  readFileSync(stagedAppManifestPath, "utf8")
) as { dependencies?: Record<string, string> };

stagedAppManifest.dependencies ??= {};

for (const id of FIXTURE_MODULES) {
  stagedAppManifest.dependencies[`@genie/module-${id}`] = "workspace:*";
}

writeFileSync(
  stagedAppManifestPath,
  `${JSON.stringify(stagedAppManifest, null, 2)}\n`,
  "utf8"
);

// The staged lockfile gains the three fixture importers, now as app
// dependencies; every version pin already exists in the repository lockfile,
// so this needs no new resolution and no network.
run(
  "lockfile",
  "pnpm",
  ["install", "--lockfile-only", "--ignore-scripts"],
  STAGE
);

if (failed) process.exit(1);

const stagedLockfile = readFileSync(join(STAGE, "pnpm-lock.yaml"), "utf8");

for (const id of FIXTURE_MODULES) {
  if (!stagedLockfile.includes(`packages/modules/${id}:`)) {
    console.error(
      `[fixture-image] the staged lockfile has no importer for packages/modules/${id}; refusing to build.`
    );

    process.exit(1);
  }
}

// The packaging contract stays exactly the production one: the frozen install
// is the image's own guard, and this harness must never rewrite it away.
const stagedDockerfile = readFileSync(join(STAGE, "deploy/Dockerfile"), "utf8");

if (!stagedDockerfile.includes("--frozen-lockfile")) {
  console.error(
    "[fixture-image] deploy/Dockerfile no longer installs with --frozen-lockfile; the fixture build refuses to proceed on a changed packaging contract."
  );

  process.exit(1);
}

run(
  "build",
  "docker",
  [
    "build",
    "-f",
    "deploy/Dockerfile",
    "--build-arg",
    `MODULE_INCLUDE=${FIXTURE_MODULES.join(",")}`,
    "-t",
    FIXTURE_TAG,
    ".",
  ],
  STAGE
);

if (failed) {
  console.error(
    `[fixture-image] the fixture image was not built. The staged context is retained at ${STAGE} for inspection.`
  );

  process.exit(1);
}

// The build succeeded, so the context was spent: this run's own stage is the
// one path this invocation removes. Stages of earlier runs — including the
// retained stages of their failures — are never touched.
rmSync(STAGE, { recursive: true, force: true });

console.log(
  `\n[fixture-image] built ${FIXTURE_TAG}. Browser proof, from the workspace root:\n` +
    `  GENIE_IMAGE=${FIXTURE_TAG} GENIE_HOST_PORT=3406 \\\n` +
    `    pnpm --filter @genie/app run test:e2e:fixture`
);

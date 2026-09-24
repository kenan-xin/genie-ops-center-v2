import { execFile, execFileSync } from "node:child_process";
import { createHash, type Hash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";

import { dockerBuild } from "./image-process.ts";
import {
  REPO_ROOT,
  stageFixtureModule,
  stageWorkspace,
} from "./stage-workspace.ts";

const run = promisify(execFile);

/**
 * The explicitly empty selection image, built once per run and shared by the
 * prune proof and the customer image matrix.
 *
 * Both suites need the same bytes: the prune proof asserts the builder stage's
 * prune log, and the matrix boots the result. Building it once removes a whole
 * `docker build` from the integration run. The build stages the workspace with
 * the extra fixture module, exactly as the prune proof always did, so the prune
 * log has a second folder to remove; the empty selection prunes that folder too,
 * so the runtime image is still core-only and the matrix's boot checks hold.
 *
 * The build log travels beside the image id in a marker under the OS temporary
 * directory, because the two suites are separate test files with separate module
 * state: whichever runs first builds and writes the marker, the other reads it
 * and boots the same tag. The marker is reused only when its run id, its input
 * digest and the tag's image id all match what this call sees, so evidence can
 * never be borrowed from another run or from a build of different inputs. A
 * failed build throws with the log, exactly as `buildImageWith` does, so an
 * earlier tag can never be booted in place of this run's empty image. Neither
 * order is privileged, and either suite run alone still builds what it needs.
 */
export const SHARED_EMPTY_IMAGE = "genie-s011:empty";

/** The extra fixture module the prune proof stages, so there is a folder to remove. */
export const PRUNE_FIXTURE_MODULE = "permitted-viewer";

export type SharedEmptyBuild = {
  readonly tag: string;
  /** The builder's plain-progress log, which carries the `[module-prune]` lines. */
  readonly log: string;
};

/** The run id, input digest, image id and log of the build this run produced. */
export type Marker = {
  readonly runId: string;
  readonly digest: string;
  readonly imageId: string;
  readonly log: string;
};

const MARKER_PATH = join(tmpdir(), "genie-s011-shared-empty.json");

/**
 * The paths whose bytes decide the empty image. Hashing them means a changed
 * prune, resolver or Dockerfile forces a rebuild instead of satisfying the
 * marker with a previous image.
 *
 * They are only part of the answer. The Dockerfile stages the whole repository,
 * so `inputDigest` also folds in the git revision and working-tree state, which
 * cover everything else the build copies: `apps/genie` sources, `packages/**`,
 * `pnpm-lock.yaml`, the root configs and `deploy/entrypoint.sh`.
 */
export const DIGEST_INPUTS: readonly string[] = [
  "tools/generators/src/selection",
  "deploy/Dockerfile",
  "apps/genie/tools/fixture-modules/permitted-viewer",
];

/** Runs one git subcommand in `cwd` and returns its stdout, or throws when git is unavailable. */
export type GitRunner = (args: readonly string[], cwd: string) => string;

/** The real git, used unless a caller supplies its own. `execFileSync` throws on a failed command. */
function gitStdout(args: readonly string[], cwd: string): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" });
}

/** How to locate the repository and reach git, for the digest's own tests. */
export type DigestOptions = {
  readonly repoRoot?: string;
  readonly git?: GitRunner;
};

/**
 * The repository-relative paths of every entry `git status --porcelain=v1 -z`
 * reports. A rename or copy carries the original path as the next NUL field,
 * which is skipped: only the current path has bytes to hash.
 */
function changedPaths(status: string): readonly string[] {
  const fields = status.split("\0");
  const paths: string[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];

    if (field === undefined || field === "") continue;

    paths.push(field.slice(3));

    const code = field.slice(0, 2);

    if (code.startsWith("R") || code.startsWith("C")) index += 1;
  }

  return paths;
}

/** Every file at or under `absolute`, recursively. */
function filesUnder(absolute: string): readonly string[] {
  if (statSync(absolute).isFile()) return [absolute];

  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * A digest of everything the empty image's build depends on: the bytes of the
 * named inputs, the committed revision, and the working tree. The revision and
 * the working tree close the gap the named inputs left, because the Dockerfile
 * stages the whole repository; the status output alone is not enough, since an
 * edit to an already-dirty file leaves it unchanged, so the content of every
 * path it lists is hashed too.
 *
 * Throws when git cannot answer. The caller treats that as "no digest" and
 * rebuilds: a digest that cannot see the tree must never certify reuse.
 */
export function inputDigest(options: DigestOptions = {}): string {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const git = options.git ?? gitStdout;
  const hash = createHash("sha256");

  hashNamedInputs(hash, repoRoot);
  hashGitState(hash, repoRoot, git);

  return hash.digest("hex");
}

/** Hashes the bytes and repository-relative names of the named inputs. */
function hashNamedInputs(hash: Hash, repoRoot: string): void {
  for (const input of DIGEST_INPUTS) {
    for (const file of filesUnder(join(repoRoot, input)).toSorted()) {
      hash.update(relative(repoRoot, file));
      hash.update("\0");
      hash.update(readFileSync(file));
      hash.update("\0");
    }
  }
}

/** Hashes the revision, the status, and the bytes of every path the status reports. */
function hashGitState(hash: Hash, repoRoot: string, git: GitRunner): void {
  hash.update("head\0");
  hash.update(git(["rev-parse", "HEAD"], repoRoot).trim());
  hash.update("\0");

  const status = git(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    repoRoot
  );

  hash.update("status\0");
  hash.update(status);
  hash.update("\0");

  for (const path of changedPaths(status)) {
    const absolute = join(repoRoot, path);

    hash.update("content\0");
    hash.update(path);
    hash.update("\0");
    hash.update(
      existsSync(absolute) && statSync(absolute).isFile()
        ? readFileSync(absolute)
        : Buffer.from("<absent>")
    );
    hash.update("\0");
  }
}

/**
 * The marker to reuse, or `undefined` when this run cannot reuse it. A marker is
 * only valid when the tag still resolves to the image it names, when its digest
 * matches the inputs this run sees, and when it belongs to this run. A missing
 * digest — git failed — never matches, so the caller builds.
 */
export function reusableMarker(args: {
  readonly existing: string | undefined;
  readonly marker: Marker | undefined;
  readonly digest: string | undefined;
  readonly runId: string;
}): Marker | undefined {
  const { existing, marker, digest, runId } = args;

  if (
    existing === undefined ||
    digest === undefined ||
    marker === undefined ||
    marker.imageId !== existing ||
    marker.digest !== digest ||
    marker.runId !== runId
  ) {
    return undefined;
  }

  return marker;
}

/**
 * This run's id: the vitest process that every forked test file shares as its
 * parent. Files in one `vitest run` share it, so the two suites reuse one build;
 * a later run is a new process, so its id differs and the build runs again.
 */
function currentRunId(): string {
  return String(process.ppid);
}

/** The Docker image id behind a tag, or `undefined` when the tag is absent. */
async function imageId(tag: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(
      "docker",
      ["image", "inspect", "--format", "{{.Id}}", tag],
      { encoding: "utf8" }
    );

    const id = stdout.trim();

    return id === "" ? undefined : id;
  } catch {
    return undefined;
  }
}

/** The marker left by this run's builder, or `undefined` when none is usable. */
function readMarker(): Marker | undefined {
  try {
    // SAFETY: the marker is written by `writeMarker` as exactly this shape; a
    // malformed or missing file falls into the catch and forces a fresh build.
    return JSON.parse(readFileSync(MARKER_PATH, "utf8")) as Marker;
  } catch {
    return undefined;
  }
}

function writeMarker(marker: Marker): void {
  mkdirSync(dirname(MARKER_PATH), { recursive: true });
  writeFileSync(MARKER_PATH, JSON.stringify(marker), "utf8");
}

/** The end of a build log, where a failure lives, for the thrown diagnostic. */
function tail(log: string): string {
  return log.slice(-6000);
}

/**
 * Returns the shared empty image, building it only when this run has not already
 * built these exact inputs. The log returned with a reused image is the log its
 * build produced. Throws with the build log when the build fails, so a caller
 * can never boot a leftover tag in place of this run's image.
 */
export async function sharedEmptyImage(): Promise<SharedEmptyBuild> {
  const runId = currentRunId();
  const existing = await imageId(SHARED_EMPTY_IMAGE);

  // Fail closed: a digest that cannot see the repository is no digest at all, so
  // the marker is never consulted and the build runs.
  let digest: string | undefined;

  try {
    digest = inputDigest();
  } catch {
    digest = undefined;
  }

  const reusable = reusableMarker({
    existing,
    marker: digest === undefined ? undefined : readMarker(),
    digest,
    runId,
  });

  if (reusable !== undefined) {
    return { tag: SHARED_EMPTY_IMAGE, log: reusable.log };
  }

  const stage = stageWorkspace("genie-s011-shared-empty-");

  try {
    stageFixtureModule(stage, PRUNE_FIXTURE_MODULE);

    // A unique file in the copied `packages` tree busts the prune layer's cache,
    // so the prune step prints its lines instead of being restored from a
    // previous build.
    writeFileSync(
      join(stage, "packages/.prune-proof-nonce"),
      `${process.pid}-${Date.now()}\n`
    );

    const result = await dockerBuild(stage, "", SHARED_EMPTY_IMAGE);

    if (!result.ok) {
      throw new Error(
        `docker build of ${SHARED_EMPTY_IMAGE} (MODULE_INCLUDE="") failed with exit ${result.exitCode}: ${tail(result.log)}`
      );
    }

    const built = await imageId(SHARED_EMPTY_IMAGE);

    if (built !== undefined && digest !== undefined) {
      writeMarker({ runId, digest, imageId: built, log: result.log });
    }

    return { tag: SHARED_EMPTY_IMAGE, log: result.log };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

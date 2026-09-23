import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
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
type Marker = {
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
 */
const DIGEST_INPUTS: readonly string[] = [
  "tools/generators/src/selection",
  "deploy/Dockerfile",
  "apps/genie/tools/fixture-modules/permitted-viewer",
];

/** Every file at or under `absolute`, recursively. */
function filesUnder(absolute: string): readonly string[] {
  if (statSync(absolute).isFile()) return [absolute];

  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * A digest of every file the empty image's build depends on, over the file bytes
 * and their repository-relative names, so a rename and an edit are both changes.
 */
function inputDigest(): string {
  const hash = createHash("sha256");

  for (const input of DIGEST_INPUTS) {
    for (const file of filesUnder(join(REPO_ROOT, input)).toSorted()) {
      hash.update(relative(REPO_ROOT, file));
      hash.update("\0");
      hash.update(readFileSync(file));
      hash.update("\0");
    }
  }

  return hash.digest("hex");
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
  const digest = inputDigest();
  const runId = currentRunId();
  const existing = await imageId(SHARED_EMPTY_IMAGE);
  const marker = readMarker();

  if (
    existing !== undefined &&
    marker !== undefined &&
    marker.imageId === existing &&
    marker.digest === digest &&
    marker.runId === runId
  ) {
    return { tag: SHARED_EMPTY_IMAGE, log: marker.log };
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

    if (built !== undefined) {
      writeMarker({ runId, digest, imageId: built, log: result.log });
    }

    return { tag: SHARED_EMPTY_IMAGE, log: result.log };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

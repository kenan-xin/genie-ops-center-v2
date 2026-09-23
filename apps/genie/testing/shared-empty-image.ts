import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { dockerBuild } from "./image-process.ts";
import { stageFixtureModule, stageWorkspace } from "./stage-workspace.ts";

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
 * and boots the same tag. A per-run nonce busts the prune layer's cache, so the
 * log being asserted is always produced by this run's build and a marker from an
 * earlier run cannot satisfy it. Neither order is privileged, and either suite
 * run alone still builds what it needs.
 */
export const SHARED_EMPTY_IMAGE = "genie-s011:empty";

/** The extra fixture module the prune proof stages, so there is a folder to remove. */
export const PRUNE_FIXTURE_MODULE = "permitted-viewer";

export type SharedEmptyBuild = {
  readonly tag: string;
  readonly ok: boolean;
  /** The builder's plain-progress log, which carries the `[module-prune]` lines. */
  readonly log: string;
};

/** The image id and log of the build this run produced, for reuse by the other suite. */
type Marker = { readonly imageId: string; readonly log: string };

const MARKER_PATH = join(tmpdir(), "genie-s011-shared-empty.json");

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

/**
 * Returns the shared empty image, building it only when this run has not already
 * built it. The log returned with a reused image is the log its build produced.
 */
export async function sharedEmptyImage(): Promise<SharedEmptyBuild> {
  const existing = await imageId(SHARED_EMPTY_IMAGE);
  const marker = readMarker();

  if (existing !== undefined && marker?.imageId === existing) {
    return { tag: SHARED_EMPTY_IMAGE, ok: true, log: marker.log };
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

    if (result.ok) {
      const built = await imageId(SHARED_EMPTY_IMAGE);

      if (built !== undefined) {
        writeMarker({ imageId: built, log: result.log });
      }
    }

    return { tag: SHARED_EMPTY_IMAGE, ok: result.ok, log: result.log };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The local cache, measured against the real Nx graph rather than a label.
 *
 * Every case reads the restored registry's bytes. A cache summary line alone
 * proves nothing: the question this ticket asks is whether the file a consumer
 * then compiles belongs to the selection that was asked for.
 *
 * The whole matrix runs against a temporary Nx cache and a temporary Nx state
 * directory, so it neither reads nor writes the developer's own cache. Both are
 * needed: Nx 23 keeps its cache metadata in a database under the state
 * directory, and pointing only NX_CACHE_DIRECTORY at a fresh path still reports
 * hits from the checkout's database.
 *
 * `apps/genie/src/modules.ts` is a generated artifact and this suite rewrites
 * it. The checkout's copy is captured before the first case and written back
 * after the last one.
 */
const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

const NX = resolve(WORKSPACE_ROOT, "node_modules/.bin/nx");

const REGISTRY = resolve(WORKSPACE_ROOT, "apps/genie/src/modules.ts");

const TASK = "@genie/app:generate-registry";

let cacheDirectory = "";

let stateDirectory = "";

let original: string | undefined;

type Run = {
  readonly output: string;
  readonly registry: string;
};

/**
 * Runs one Nx task for one selection. `undefined` means the variable is unset,
 * which is a different selection from an empty string and must stay that way
 * all the way to the hash.
 */
function run(task: string, moduleInclude: string | undefined): Run {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NX_CACHE_DIRECTORY: cacheDirectory,
    NX_WORKSPACE_DATA_DIRECTORY: stateDirectory,
    NX_DAEMON: "false",
  };

  if (moduleInclude === undefined) delete env.MODULE_INCLUDE;
  else env.MODULE_INCLUDE = moduleInclude;

  const result = spawnSync(NX, ["run", task], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    env,
  });

  const output = `${result.stdout}${result.stderr}`;

  if (result.status !== 0) {
    throw new Error(`${task} failed for ${String(moduleInclude)}:\n${output}`);
  }

  return {
    output,
    registry: existsSync(REGISTRY) ? readFileSync(REGISTRY, "utf8") : "",
  };
}

/** Whether Nx served the task from the cache instead of running its command. */
function servedFromCache(output: string, task: string): boolean {
  const line = output
    .split("\n")
    .find((candidate) => candidate.includes(`nx run ${task}`));

  return (
    line !== undefined &&
    (line.includes("[local cache]") ||
      line.includes("existing outputs match the cache"))
  );
}

beforeAll(() => {
  cacheDirectory = mkdtempSync(join(tmpdir(), "genie-selection-cache-"));
  stateDirectory = mkdtempSync(join(tmpdir(), "genie-selection-state-"));

  original = existsSync(REGISTRY) ? readFileSync(REGISTRY, "utf8") : undefined;
});

afterAll(() => {
  for (const directory of [cacheDirectory, stateDirectory]) {
    if (directory !== "") rmSync(directory, { recursive: true, force: true });
  }

  if (original !== undefined) writeFileSync(REGISTRY, original, "utf8");
});

describe("two selections on one revision", () => {
  it("restores each selection's own registry, and never the other's", () => {
    const placeholder = run(TASK, "placeholder");

    expect(servedFromCache(placeholder.output, TASK)).toBe(false);
    expect(placeholder.registry).toContain("@genie/module-placeholder");

    const empty = run(TASK, "");

    expect(servedFromCache(empty.output, TASK)).toBe(false);
    expect(empty.registry).not.toContain("@genie/module-placeholder");
    expect(empty.registry).toContain("export const selectedModules = []");

    // Back to the first selection: a hit, and the bytes are the first run's.
    const again = run(TASK, "placeholder");

    expect(servedFromCache(again.output, TASK)).toBe(true);
    expect(again.registry).toBe(placeholder.registry);
  });

  it("repeats an identical selection from the cache, byte for byte", () => {
    const first = run(TASK, "placeholder");
    const second = run(TASK, "placeholder");

    expect(servedFromCache(second.output, TASK)).toBe(true);
    expect(second.registry).toBe(first.registry);
  });

  // Spelling the resolver discards must not split one selection into two
  // cache entries.
  it("treats two spellings of one selection as one entry", () => {
    const plain = run(TASK, "placeholder");
    const spaced = run(TASK, " placeholder ");

    expect(servedFromCache(spaced.output, TASK)).toBe(true);
    expect(spaced.registry).toBe(plain.registry);
  });
});

describe("an unset selection and an explicitly empty one", () => {
  it("restores different registries for each", () => {
    const unset = run(TASK, undefined);

    expect(unset.registry).toContain("Selection source: unset");
    expect(unset.registry).toContain("@genie/module-placeholder");

    const empty = run(TASK, "");

    expect(empty.registry).toContain("Selection source: explicit");
    expect(empty.registry).not.toContain("@genie/module-placeholder");

    expect(run(TASK, undefined).registry).toBe(unset.registry);
  });
});

describe("a deleted output", () => {
  it("is restored from the cache before any consumer reads it", () => {
    const first = run(TASK, "placeholder");

    rmSync(REGISTRY);

    expect(existsSync(REGISTRY)).toBe(false);

    const restored = run(TASK, "placeholder");

    // Not "outputs already match": the file was gone, so a hit here means Nx
    // wrote it back out of the cache.
    expect(restored.output).toContain("[local cache]");
    expect(restored.registry).toBe(first.registry);
  });
});

describe("a consumer of the generated registry", () => {
  /**
   * The regression guard for the defect this ticket found on 2026-09-22: with
   * the selection declared only on generation, `typecheck` was served from the
   * previous selection's cache entry, because its hash was computed from the
   * registry on disk before generation rewrote it. It never compiled the
   * registry it was given.
   */
  it("runs again when the selection changes", () => {
    const task = "@genie/app:typecheck";

    run(task, "placeholder");

    const empty = run(task, "");

    expect(servedFromCache(empty.output, task)).toBe(false);
    expect(empty.registry).not.toContain("@genie/module-placeholder");

    const repeat = run(task, "");

    expect(servedFromCache(repeat.output, task)).toBe(true);
  }, 600000);
});

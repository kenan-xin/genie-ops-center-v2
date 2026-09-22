import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
 * The whole matrix runs inside a staged workspace, never the checkout. An
 * earlier version drove Nx in the checkout itself and passed whenever it ran
 * alone, then failed inside `pnpm test`: `nx run-many` runs sibling targets at
 * the same time, those tasks regenerate the registry and touch the same inputs,
 * and the cache hits this suite asserts stop being reachable. A suite that
 * needs the whole workspace to itself is a suite that reports the state of the
 * machine, not the state of the build graph.
 *
 * The stage is a copy of the checkout with the root `node_modules` symlinked
 * back, which is read-only during these tasks. `apps/genie/node_modules` is
 * copied as it stands, because its entries are relative symlinks and therefore
 * resolve to the stage's own packages.
 */
const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

/** Build output, version control, caches and bulk documents: none is an input here. */
const PRUNED = new Set([
  ".git",
  ".next",
  ".nx",
  ".beads",
  ".impeccable",
  ".turbo",
  "storybook-static",
  "test-results",
  "playwright-report",
  "coverage",
  "dist",
  "docs",
  "plans",
]);

const TASK = "@genie/app:generate-registry";

let stage = "";

type Run = {
  readonly output: string;
  readonly registry: string;
};

const registryPath = () => join(stage, "apps/genie/src/modules.ts");

/** Built from the escape character rather than written literally, which no linter has to be told to allow. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const stripAnsi = (text: string) => text.replace(ANSI, "");

/**
 * Runs one Nx task for one selection, inside the stage. `undefined` means the
 * variable is unset, which is a different selection from an empty string and
 * must stay that way all the way to the hash.
 */
function run(task: string, moduleInclude: string | undefined): Run {
  // Every inherited NX_ variable is dropped before the three this suite sets.
  //
  // This suite measures the cache, so it has to own every input to the cache
  // decision. Nx puts its own task context into a child's environment, and
  // `NX_SKIP_NX_CACHE` is among the values that reach here when these cases run
  // inside `nx run @genie/app:test:integration`. Inheriting it turned every
  // cache assertion false and made the suite report how it had been invoked
  // rather than what the build graph does.
  const env = { ...process.env };

  for (const name of Object.keys(env)) {
    if (name.startsWith("NX_")) delete env[name];
  }

  env.NX_CACHE_DIRECTORY = join(stage, ".nxcache");

  env.NX_WORKSPACE_DATA_DIRECTORY = join(stage, ".nxdata");

  env.NX_DAEMON = "false";

  if (moduleInclude === undefined) delete env.MODULE_INCLUDE;
  else env.MODULE_INCLUDE = moduleInclude;

  const result = spawnSync(join(stage, "node_modules/.bin/nx"), ["run", task], {
    cwd: stage,
    encoding: "utf8",
    env,
  });

  // Nx colorizes when its parent asks for colour, which it does when these
  // cases run inside `nx run @genie/app:test:integration`. The escape codes
  // land between `nx run` and the project name, so a plain-text search for the
  // task stopped matching and every cache assertion read false while the cache
  // was in fact hitting. The codes are removed before anything is read.
  const output = stripAnsi(`${result.stdout}${result.stderr}`);

  if (result.status !== 0) {
    throw new Error(`${task} failed for ${String(moduleInclude)}:\n${output}`);
  }

  return {
    output,
    registry: existsSync(registryPath())
      ? readFileSync(registryPath(), "utf8")
      : "",
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
  stage = mkdtempSync(join(tmpdir(), "genie-selection-cache-"));

  cpSync(WORKSPACE_ROOT, stage, {
    recursive: true,
    filter: (source) => {
      const name = source.split(/[\\/]/).pop() ?? "";

      // The root node_modules is replaced by a symlink below. A nested one, such
      // as the app's, is copied: its entries are relative symlinks into the
      // workspace, so inside the stage they point at the stage's own packages.
      if (source === join(WORKSPACE_ROOT, "node_modules")) return false;

      return !PRUNED.has(name);
    },
  });

  symlinkSync(
    join(WORKSPACE_ROOT, "node_modules"),
    join(stage, "node_modules")
  );
}, 300000);

afterAll(() => {
  if (stage !== "") rmSync(stage, { recursive: true, force: true });
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

    expect(servedFromCache(again.output, TASK), again.output).toBe(true);
    expect(again.registry).toBe(placeholder.registry);
  });

  it("repeats an identical selection from the cache, byte for byte", () => {
    const first = run(TASK, "placeholder");
    const second = run(TASK, "placeholder");

    expect(servedFromCache(second.output, TASK), second.output).toBe(true);
    expect(second.registry).toBe(first.registry);
  });

  // Spelling the resolver discards must not split one selection into two
  // cache entries.
  it("treats two spellings of one selection as one entry", () => {
    const plain = run(TASK, "placeholder");
    const spaced = run(TASK, " placeholder ");

    expect(servedFromCache(spaced.output, TASK), spaced.output).toBe(true);
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

    rmSync(registryPath());

    expect(existsSync(registryPath())).toBe(false);

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
    // The app's own test target, not typecheck. Both declare the selection as
    // an input, and the defect applies to each the same way, but typecheck also
    // depends on `^build`, which makes the staged workspace run an install that
    // needs a git repository the stage deliberately does not have.
    const task = "@genie/app:test";

    run(task, "placeholder");

    const empty = run(task, "");

    expect(servedFromCache(empty.output, task), empty.output).toBe(false);
    expect(empty.registry).not.toContain("@genie/module-placeholder");

    const repeat = run(task, "");

    expect(servedFromCache(repeat.output, task), repeat.output).toBe(true);
  }, 600000);
});

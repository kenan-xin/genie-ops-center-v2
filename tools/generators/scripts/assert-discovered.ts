#!/usr/bin/env node
import { resolve } from "node:path";

import { sharedStorybookConfig } from "@genie/config/storybook";

import {
  readModuleInventory,
  resolveModuleSelection,
} from "../src/selection/index.ts";

/**
 * Proves a generated module is discovered by the same data-only selection the
 * application registry and the Storybook host both read (R-41a, R-41b).
 *
 * It imports no module declaration: the inventory is package metadata, and the
 * story globs are built from the resolved package roots.
 */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const [, , id] = process.argv;

if (id === undefined) {
  console.error("usage: assert-discovered.mjs <module-id>");
  process.exit(1);
}

const inventory = readModuleInventory(REPO_ROOT);

const entry = inventory.find((candidate) => candidate.id === id);

if (entry === undefined) {
  console.error(
    `the inventory does not hold ${id}. Discovery reads package metadata, so the generated manifest is wrong.`
  );
  process.exit(1);
}

if (entry.packageName !== `@genie/module-${id}`) {
  console.error(
    `the inventory names ${id} as ${entry.packageName}, which breaks the naming invariant.`
  );
  process.exit(1);
}

// The default selection is every module, which is development and CI only.
const all = resolveModuleSelection({
  moduleInclude: undefined,
  inventory,
  workspaceRoot: REPO_ROOT,
});

if (!all.ids.includes(id)) {
  console.error(`the unset selection does not reach ${id}.`);
  process.exit(1);
}

// An explicit selection naming only this module reaches it and nothing else.
const only = resolveModuleSelection({
  moduleInclude: id,
  inventory,
  workspaceRoot: REPO_ROOT,
});

if (only.ids.length !== 1 || only.ids[0] !== id) {
  console.error(
    `an explicit selection of ${id} resolved to ${only.ids.join(", ")}.`
  );
  process.exit(1);
}

// An explicit selection that excludes it must not reach it.
const without = resolveModuleSelection({
  moduleInclude: "placeholder",
  inventory,
  workspaceRoot: REPO_ROOT,
});

if (without.ids.includes(id)) {
  console.error(`a selection of placeholder alone still reached ${id}.`);
  process.exit(1);
}

// The Storybook host builds its globs from the resolved roots, so a selected
// module's stories are discovered with no host or CI edit.
const selected = sharedStorybookConfig({
  moduleRoots: only.entries.map((candidate) => candidate.packageRoot),
});

const storyGlob = selected.stories.find((glob) =>
  glob.includes(entry.packageRoot)
);

if (storyGlob === undefined) {
  console.error(
    `the Storybook host builds no story glob for ${entry.packageRoot}.`
  );
  process.exit(1);
}

const excluded = sharedStorybookConfig({
  moduleRoots: without.entries.map((candidate) => candidate.packageRoot),
});

if (excluded.stories.some((glob) => glob.includes(entry.packageRoot))) {
  console.error(`an excluded ${id} still contributes a story glob.`);
  process.exit(1);
}

process.stdout.write(
  `${id} is discovered by selection and by the Storybook host, and is absent from both when excluded.\n${storyGlob}\n`
);

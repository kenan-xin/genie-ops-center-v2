import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  emitRegistryModule,
  readModuleInventory,
  resolveModuleSelection,
} from "@genie/generators";

/**
 * The application-owned generation target of ADR 0008.
 *
 * Tooling reads a data-only inventory and emits import text. It never imports or
 * evaluates a module declaration. The application validates the selected
 * declarations separately, at load, in src/registry.ts.
 */
const CHECKOUT_ROOT = resolve(import.meta.dirname, "../../..");

export const REGISTRY_PATH = "apps/genie/src/modules.ts";

/**
 * The build root, taken from `--root` or the checkout this script sits in.
 *
 * The root is a parameter and never an inferred global, which is what keeps two
 * concurrent customer selections apart: each run writes inside the root it was
 * handed, and knows no other. A `--root` without a path is refused rather than
 * silently falling back, because falling back would write the checkout's
 * registry from a run that meant to write somewhere else.
 */
export function rootFromArgv(
  argv: readonly string[],
  fallback: string
): string {
  const index = argv.indexOf("--root");

  if (index === -1) {
    return fallback;
  }

  const value = argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error("--root needs a path.");
  }

  return resolve(value);
}

/** Writes the registry for one selection inside one build root. */
export function generateRegistry(
  workspaceRoot: string,
  moduleInclude: string | undefined
): string {
  const selection = resolveModuleSelection({
    moduleInclude,
    inventory: readModuleInventory(workspaceRoot),
    workspaceRoot,
  });

  const target = resolve(workspaceRoot, REGISTRY_PATH);

  mkdirSync(dirname(target), { recursive: true });

  writeFileSync(target, emitRegistryModule(selection), "utf8");

  return `generated ${target} for selection ${selection.source} [${selection.ids.join(", ")}]`;
}

function main(): void {
  const root = rootFromArgv(process.argv.slice(2), CHECKOUT_ROOT);

  process.stdout.write(
    `${generateRegistry(root, process.env.MODULE_INCLUDE)}\n`
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

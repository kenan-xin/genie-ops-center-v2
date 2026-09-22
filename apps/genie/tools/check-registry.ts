import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  emitRegistryModule,
  readModuleInventory,
  resolveModuleSelection,
} from "@genie/generators";

import { REGISTRY_PATH, rootFromArgv } from "./generate-registry.ts";

const CHECKOUT_ROOT = resolve(import.meta.dirname, "../../..");

/**
 * Refuses to bundle a registry that belongs to another selection.
 *
 * Generation runs before the build through the Nx graph, which leaves one
 * window: between the two, the file on disk can be a registry another customer's
 * run wrote, a cache entry restored for a different hash, or a hand edit. The
 * container's load-time identity check cannot see any of those, because it reads
 * the same generated file it is checking against.
 *
 * The build script runs this twice, before the bundler and after it. One check
 * before the bundler cannot settle the question on its own: the bundler reads
 * the registry minutes later, and a second build in the same checkout can
 * rewrite it in between. Running it again afterwards turns that race into a
 * failed build instead of a bundle built from another customer's selection.
 * Two selections that must run at the same time get two build roots, which is
 * what `--root` is for; this check is what makes the unsupported case loud.
 *
 * The comparison is the whole emitted text, byte for byte. `emitRegistryModule`
 * is deterministic given a selection, so an exact comparison needs no header
 * field to parse and cannot drift from what generation would have written. It
 * also separates an unset selection from an explicitly empty one even when both
 * import the same packages, because the emitted text records the source.
 *
 * Returns the reason, or undefined when the registry is the one this selection
 * generates.
 */
export function registryMismatch(
  workspaceRoot: string,
  moduleInclude: string | undefined
): string | undefined {
  const target = resolve(workspaceRoot, REGISTRY_PATH);

  if (!existsSync(target)) {
    return `There is no generated registry at ${target}. Run generate-registry before the build.`;
  }

  const selection = resolveModuleSelection({
    moduleInclude,
    inventory: readModuleInventory(workspaceRoot),
    workspaceRoot,
  });

  if (readFileSync(target, "utf8") === emitRegistryModule(selection)) {
    return undefined;
  }

  return (
    `${target} is not the registry this selection generates. ` +
    `The selection is ${selection.source} [${selection.ids.join(", ")}]. ` +
    `A concurrent build in this checkout, another build root, a restored cache entry or a hand edit left a different registry. Give each selection its own build root, then regenerate.`
  );
}

function main(): void {
  const root = rootFromArgv(process.argv.slice(2), CHECKOUT_ROOT);

  const problem = registryMismatch(root, process.env.MODULE_INCLUDE);

  if (problem !== undefined) {
    process.stderr.write(`${problem}\n`);

    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

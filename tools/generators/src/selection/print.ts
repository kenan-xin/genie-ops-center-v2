import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { serializeSelection } from "./fingerprint.ts";
import { readModuleInventory } from "./inventory.ts";
import { resolveModuleSelection } from "./resolve.ts";

/**
 * The value Nx hashes before it decides whether a selection-dependent task can
 * be restored from the cache.
 *
 * Nx runs this script itself, as a `runtime` input, so every entrypoint is
 * covered by construction: a direct `nx run`, a package script and the image
 * build stage all hash the same value. There is no wrapper to forget.
 *
 * The raw MODULE_INCLUDE value cannot serve as that input. It cannot tell an
 * unset variable from an empty one, although the resolver calls those opposite
 * selections, and it carries spelling the resolver discards, so `alpha, beta`
 * and `alpha,beta` would miss each other's cache entry.
 *
 * Two lines are printed. The first is the canonical serialized selection, which
 * is already the repository's source of selection truth. The second is a digest
 * over the selected entries' identity, package name and entrypoint path, in
 * resolved order: it is what makes a rename or an entrypoint move invalidate
 * the cache even when the ids did not change. An entry the selection excludes
 * contributes to neither line.
 *
 * This reads module metadata as data. It never imports or evaluates a module.
 */
export function selectionLines(
  workspaceRoot: string,
  moduleInclude: string | undefined
): string {
  const selection = resolveModuleSelection({
    moduleInclude,
    inventory: readModuleInventory(workspaceRoot),
    workspaceRoot,
  });

  const metadata = JSON.stringify(
    selection.entries.map((entry) => [
      entry.id,
      entry.packageName,
      entry.entrypoint,
    ])
  );

  const digest = createHash("sha256").update(metadata, "utf8").digest("hex");

  return `${serializeSelection(selection)}\nmetadata:${digest}`;
}

function main(): void {
  try {
    // The working directory is the workspace root, because that is where Nx runs
    // a runtime input command and where every supported entrypoint invokes it.
    process.stdout.write(
      `${selectionLines(process.cwd(), process.env.MODULE_INCLUDE)}\n`
    );
  } catch (error) {
    // A selection that cannot be resolved must never reach a cache lookup, so
    // nothing is printed and the exit code stops the hash.
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );

    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

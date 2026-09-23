import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { readModuleInventory } from "./inventory.ts";
import { resolveModuleSelection } from "./resolve.ts";

const MODULES_DIR = "packages/modules";

export type PruneResult = {
  readonly kept: readonly string[];
  readonly removed: readonly string[];
  /** Leftover folders holding no file at all, such as one whose only contents the context ignored. */
  readonly removedEmpty: readonly string[];
};

/** True when a folder holds no file at any depth, only folders or nothing. */
function holdsNoFile(path: string): boolean {
  return readdirSync(path, { recursive: true, withFileTypes: true }).every(
    (entry) => entry.isDirectory()
  );
}

/** Every non-file entry under packages/modules, sorted. A README beside them is not a folder. */
function moduleFolders(workspaceRoot: string): readonly string[] {
  const modulesRoot = join(workspaceRoot, MODULES_DIR);

  if (!existsSync(modulesRoot)) return [];

  return readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => !entry.isFile())
    .map((entry) => entry.name)
    .toSorted();
}

/**
 * Removes every module package the MODULE_INCLUDE selection does not name, then
 * checks that the remaining packages/modules folders equal the selection
 * (Spec 0 AC-24, `pg4`). The image builder stage runs this before install, so
 * an excluded module is not in the build input at all.
 *
 * The check is not redundant with the removal. The removal acts on the module
 * inventory, which only sees folders holding a module manifest. Another folder
 * that holds no file at all is removed; one that holds any file survives and
 * fails here. A frozen install would not catch it either:
 * it passes, leaving a dangling link, when a listed module folder is missing.
 *
 * Unset is refused rather than read as "every module". R-3a's default is for a
 * host build; an image build always names its selection, so an unset argument
 * is a builder that forgot it.
 */
export function pruneModuleFolders(
  workspaceRoot: string,
  moduleInclude: string | undefined
): PruneResult {
  if (moduleInclude === undefined) {
    throw new Error(
      "MODULE_INCLUDE is unset. An image build must name its module selection; pass --build-arg MODULE_INCLUDE=<ids>, or an empty value for no module."
    );
  }

  const inventory = readModuleInventory(workspaceRoot);

  // Resolved before anything is removed, so an unknown id deletes nothing.
  const selection = resolveModuleSelection({
    moduleInclude,
    inventory,
    workspaceRoot,
  });

  const selected = new Set(selection.ids);
  const removed: string[] = [];

  for (const entry of inventory) {
    if (selected.has(entry.id)) continue;

    rmSync(join(workspaceRoot, entry.packageRoot), {
      recursive: true,
      force: true,
    });

    removed.push(entry.id);
  }

  // A branch switch leaves packages/modules/<old>/node_modules behind, and the
  // image context drops the ignored contents but keeps the folders. A folder
  // with no file holds no code, so it is removed rather than failing the build.
  // One with any file fails the check below.
  const removedEmpty: string[] = [];

  for (const folder of moduleFolders(workspaceRoot)) {
    const path = join(workspaceRoot, MODULES_DIR, folder);

    if (
      selected.has(folder) ||
      !lstatSync(path).isDirectory() ||
      !holdsNoFile(path)
    )
      continue;

    rmSync(path, { recursive: true, force: true });

    removedEmpty.push(folder);
  }

  const remaining = moduleFolders(workspaceRoot);
  const stray = remaining.filter((folder) => !selected.has(folder));

  if (stray.length > 0) {
    throw new Error(
      `${MODULES_DIR} holds ${stray.join(", ")}, which the selection does not name. The build input must hold only the selected modules.`
    );
  }

  return { kept: remaining, removed: removed.toSorted(), removedEmpty };
}

const listed = (ids: readonly string[]) =>
  ids.length === 0 ? "(none)" : ids.join(", ");

function main(): void {
  try {
    // The working directory is the workspace root, as for print.ts.
    const { kept, removed, removedEmpty } = pruneModuleFolders(
      process.cwd(),
      process.env.MODULE_INCLUDE
    );

    process.stdout.write(`[module-prune] kept: ${listed(kept)}\n`);
    process.stdout.write(`[module-prune] removed: ${listed(removed)}\n`);

    for (const folder of removedEmpty) {
      process.stdout.write(`[module-prune] removed empty folder: ${folder}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `[module-prune] ${error instanceof Error ? error.message : String(error)}\n`
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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { moduleNamingError } from "../workspace/module-naming.ts";

/** One module, described by data only. No declaration is ever imported. */
export type ModuleInventoryEntry = {
  readonly id: string;
  readonly packageName: string;
  /** Repository-relative folder of the module package. */
  readonly packageRoot: string;
  /** Repository-relative path to the module declaration file. A string, never an import. */
  readonly entrypoint: string;
};

type ModulePackageManifest = {
  readonly name?: string;
  readonly genie?: {
    readonly module?: { readonly id?: string; readonly entrypoint?: string };
  };
};

const MODULES_DIR = "packages/modules";

/**
 * Reads the data-only module inventory from package metadata under packages/modules.
 * Reads bytes and parses JSON. It never imports, evaluates, or resolves a module.
 */
export function readModuleInventory(
  workspaceRoot: string
): readonly ModuleInventoryEntry[] {
  const modulesRoot = join(workspaceRoot, MODULES_DIR);

  if (!existsSync(modulesRoot)) {
    return [];
  }

  const entries: ModuleInventoryEntry[] = [];

  const folders = readdirSync(modulesRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .toSorted();

  for (const folder of folders) {
    const manifestPath = join(modulesRoot, folder, "package.json");

    if (!existsSync(manifestPath)) {
      continue;
    }

    // SAFETY: the bytes come straight from the package.json we just read, and every
    // field the code below touches is validated immediately after the parse.
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8")
    ) as ModulePackageManifest;

    const declared = manifest.genie?.module;

    if (declared?.id === undefined || declared.entrypoint === undefined) {
      throw new Error(
        `${MODULES_DIR}/${folder}/package.json has no genie.module id and entrypoint.`
      );
    }

    if (manifest.name === undefined) {
      throw new Error(`${MODULES_DIR}/${folder}/package.json has no name.`);
    }

    entries.push({
      id: declared.id,
      packageName: manifest.name,
      packageRoot: `${MODULES_DIR}/${folder}`,
      entrypoint: `${MODULES_DIR}/${folder}/${declared.entrypoint}`,
    });
  }

  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate module id in the inventory: ${entry.id}`);
    }

    seen.add(entry.id);
  }

  // After the duplicate pass, so that two folders claiming one id still report
  // the duplicate rather than a naming disagreement. Checked for every folder
  // found, before any selection or cache lookup, so a module the boundary
  // patterns cannot match never reaches a build. Metadata only: the declaration
  // is still never imported or evaluated.
  for (const entry of entries) {
    const folder = entry.packageRoot.slice(`${MODULES_DIR}/`.length);

    const naming = moduleNamingError(folder, entry.packageName, entry.id);

    if (naming !== undefined) {
      throw new Error(`${entry.packageRoot}/package.json: ${naming}.`);
    }
  }

  return entries;
}

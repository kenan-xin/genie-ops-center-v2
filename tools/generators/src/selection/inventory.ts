import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isAbsolute, normalize } from "node:path/posix";

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
    readonly module?: { readonly id?: unknown; readonly entrypoint?: unknown };
  };
};

const MODULES_DIR = "packages/modules";

/**
 * True for a usable non-empty string field, such as a module id or an entrypoint
 * path. This guard is the boundary parse itself: the generators package has no
 * runtime dependency, so a hand-written predicate is the parser that turns one
 * parsed package.json field into a domain string.
 * The anti-slop `no-runtime-typeof` rule keeps `allowInTypeGuards` off
 * repository-wide, so the guard carries a local suppression.
 */
function isNonEmptyString(value: unknown): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of package.json bytes
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The declared entrypoint as a module-relative path. Metadata only: the path is
 * emitted as import text and is never loaded, resolved, or evaluated here.
 */
function moduleEntrypoint(value: string, manifestPath: string): string {
  const trimmed = value.trim();
  const normalized = normalize(trimmed);

  // A backslash spelling is opaque to the posix normalizer and collapses into a
  // different path on Windows, so it is refused rather than inspected.
  if (
    isAbsolute(trimmed) ||
    trimmed.includes("\\") ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(
      `${manifestPath}: genie.module.entrypoint "${value}" must stay inside the module package.`
    );
  }

  if (normalized === "." || normalized.endsWith("/")) {
    throw new Error(
      `${manifestPath}: genie.module.entrypoint "${value}" must name a file rather than a folder.`
    );
  }

  return normalized;
}

/**
 * Reads the data-only module inventory from package metadata under packages/modules.
 * Reads bytes and parses JSON. It never imports, evaluates, or resolves a module.
 * Every entrypoint is a contained relative path here. Whether it also resolves to
 * a file inside its own package is decided by resolveModuleSelection, which is the
 * one place that touches the filesystem.
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

    const manifestLabel = `${MODULES_DIR}/${folder}/package.json`;

    if (!isNonEmptyString(declared.id)) {
      throw new Error(
        `${manifestLabel}: genie.module.id must be a non-empty string.`
      );
    }

    if (!isNonEmptyString(declared.entrypoint)) {
      throw new Error(
        `${manifestLabel}: genie.module.entrypoint must be a non-empty string.`
      );
    }

    const entrypoint = moduleEntrypoint(declared.entrypoint, manifestLabel);

    entries.push({
      id: declared.id,
      packageName: manifest.name,
      packageRoot: `${MODULES_DIR}/${folder}`,
      entrypoint: `${MODULES_DIR}/${folder}/${entrypoint}`,
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

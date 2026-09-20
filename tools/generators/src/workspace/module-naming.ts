import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The scope and prefix every module package name carries. */
const MODULE_PACKAGE_PREFIX = "@genie/module-";

/** The package name a module with this id must declare. */
export function modulePackageName(moduleId: string): string {
  return `${MODULE_PACKAGE_PREFIX}${moduleId}`;
}

/**
 * Returns one sentence naming how a module's folder, package name and metadata id
 * disagree, or `undefined` when the three agree
 * (`docs/architecture/repository-layout.md`, Module package naming).
 *
 * It judges agreement only. The shape of the id, kebab-case, belongs to the
 * module declaration contract (`docs/architecture/module-contract.md`, Identity
 * row, and Spec 0 R-12). Nothing enforces that shape yet. S0-03 owns the core
 * contract validator that will, tracked by `genie-ops-center-v2-1rd.1.5`. A
 * second character-set rule here would be a second source of truth, so this
 * function stays out of it rather than filling the gap.
 *
 * A string rather than a throw, so that each caller adds the file it read.
 */
export function moduleNamingError(
  folderBasename: string,
  packageName: string,
  moduleId: string
): string | undefined {
  if (folderBasename !== moduleId) {
    return `a module folder is named after its id, so folder "${folderBasename}" holds the module "${moduleId}"`;
  }

  const expected = modulePackageName(moduleId);

  if (packageName !== expected) {
    return `a module package is named after its id, so "${folderBasename}" must be "${expected}" and not "${packageName}"`;
  }

  return undefined;
}

type ModuleManifest = {
  readonly name?: string;
  readonly genie?: { readonly module?: { readonly id?: string } };
};

/**
 * Applies the naming rule to one module project by reading its manifest, and
 * returns one sentence or `undefined`. Reads bytes and parses JSON. It never
 * imports, evaluates or resolves a module declaration.
 *
 * The workspace hygiene suite calls this for every project classified `module`,
 * and the naming suite calls it against a disposable workspace, so the check is
 * proved without waiting for the first real module to exist.
 */
export function moduleProjectNamingError(
  projectRoot: string,
  workspaceRoot: string
): string | undefined {
  const manifestPath = join(workspaceRoot, projectRoot, "package.json");

  if (!existsSync(manifestPath)) {
    return `${projectRoot} has no package.json`;
  }

  // SAFETY: the bytes come straight from the package.json just confirmed present,
  // and both fields read below are checked for absence before use.
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8")
  ) as ModuleManifest;

  const moduleId = manifest.genie?.module?.id;

  if (moduleId === undefined) {
    return `${projectRoot} declares no genie.module id`;
  }

  const folderBasename = projectRoot.split("/").at(-1) ?? "";

  return moduleNamingError(folderBasename, manifest.name ?? "", moduleId);
}

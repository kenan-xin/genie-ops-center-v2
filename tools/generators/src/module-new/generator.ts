import type { Tree } from "@nx/devkit";

import { modulePackageName } from "../workspace/module-naming.ts";
import { renderModule } from "./render.ts";

/** The standard application's manifest, which composes every module in the repository. */
const APP_MANIFEST = "apps/genie/package.json";

/**
 * Only the one field this file touches is named. Every other key is carried
 * through untouched, so the manifest keeps whatever else it holds.
 */
type AppManifest = { readonly dependencies?: Record<string, string> };

/**
 * Names the new module in the standard application's dependencies.
 *
 * The application composes modules, so the registry imports each one by package
 * name; a package the application does not depend on cannot be resolved, and the
 * module would be unreachable however it was selected. Declaring the dependency
 * is not selection: `MODULE_INCLUDE` still decides which modules a given image
 * compiles, and an excluded module is never imported (R-21, R-22).
 *
 * Keys are written in order, which is the order oxfmt keeps a manifest in.
 *
 * An absent manifest is left alone rather than created: a workspace without the
 * standard application is a test's workspace, or a deployment that composes a
 * custom app of its own, and inventing an app there would be wrong.
 */
function addToApplication(tree: Tree, packageName: string): void {
  const current = tree.read(APP_MANIFEST, "utf-8");

  if (current === null) return;

  let manifest: AppManifest;

  try {
    // SAFETY: the parse is guarded below; nothing is read from it before its
    // shape is checked.
    manifest = JSON.parse(current) as AppManifest;
  } catch (error) {
    throw new Error(
      `${APP_MANIFEST} is not valid JSON, so the new module cannot be added to it.`,
      { cause: error }
    );
  }

  const existing = manifest.dependencies;

  // A manifest is a file anyone can edit, so the one field this function writes
  // is checked before it is spread. Spreading a string here would write its
  // characters into the manifest as index-keyed dependencies.
  if (existing !== undefined && Object(existing) !== existing) {
    throw new Error(
      `${APP_MANIFEST} has a "dependencies" field that is not an object, so the new module cannot be added to it.`
    );
  }

  if (Array.isArray(existing)) {
    throw new Error(
      `${APP_MANIFEST} has a "dependencies" field that is a list, not an object, so the new module cannot be added to it.`
    );
  }

  const dependencies = { ...existing, [packageName]: "workspace:*" };

  // Sorted by code point, which is what a manifest formatter uses. A
  // locale-sensitive comparison would order two names differently on two
  // machines and show up as a diff on the next format.
  const sorted = Object.fromEntries(
    Object.entries(dependencies).toSorted(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  );

  tree.write(
    APP_MANIFEST,
    `${JSON.stringify({ ...manifest, dependencies: sorted }, undefined, 2)}\n`
  );
}

/** What `nx g @genie/generators:module-new <name>` accepts. */
export type ModuleGeneratorSchema = {
  readonly name: string;
  readonly displayName?: string;
};

/**
 * Writes a new module package into the workspace (R-29, R-30).
 *
 * Rendering happens first and in full, so a refused id or display name fails the
 * command before a single file is written. The generator writes the module's own
 * folder and one line of the standard application's manifest, which
 * `addToApplication` above explains; nothing else in the workspace is touched,
 * because pnpm's `packages/modules/*` glob and Nx's inference do the rest.
 *
 * An existing folder is never overwritten. Regenerating over a module that people
 * have edited would destroy their work, and a module is scaffolded once.
 */
export async function moduleGenerator(
  tree: Tree,
  options: ModuleGeneratorSchema
): Promise<void> {
  const files = renderModule(
    options.displayName === undefined
      ? { id: options.name }
      : { id: options.name, displayName: options.displayName }
  );

  const root = `packages/modules/${options.name}`;

  if (tree.exists(root)) {
    throw new Error(
      `${root} already exists. A module is scaffolded once; edit it in place or remove it first.`
    );
  }

  for (const [path, content] of files) {
    tree.write(path, content);
  }

  addToApplication(tree, modulePackageName(options.name));

  // No formatter runs here. oxfmt owns formatting in this repository, and the
  // templates are already written in its output shape.
  await Promise.resolve();
}

export default moduleGenerator;

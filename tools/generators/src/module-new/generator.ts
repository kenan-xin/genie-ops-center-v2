import type { Tree } from "@nx/devkit";

import { renderModule } from "./render.ts";

/** What `nx g @genie/generators:module <name>` accepts. */
export type ModuleGeneratorSchema = {
  readonly name: string;
  readonly displayName?: string;
};

/**
 * Writes a new module package into the workspace (R-29, R-30).
 *
 * Rendering happens first and in full, so a refused id or display name fails the
 * command before a single file is written. The generator writes inside
 * `packages/modules/<id>/` and nowhere else: registering the package is pnpm's
 * `packages/modules/*` glob and Nx's inference, not an edit to a shared file.
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

  // No formatter runs here. oxfmt owns formatting in this repository, and the
  // templates are already written in its output shape.
  await Promise.resolve();
}

export default moduleGenerator;

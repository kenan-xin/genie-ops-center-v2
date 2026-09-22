import type { Tree } from "@nx/devkit";

import { renderTenant, type TenantRenderInput } from "./render.ts";

/** What `nx g @genie/generators:tenant-new <name>` accepts. */
export type TenantGeneratorSchema = Omit<TenantRenderInput, "slug"> & {
  readonly name: string;
};

/**
 * Writes a customer's seven deployment files into the workspace (R-29, R-31).
 *
 * Rendering validates `tenant.yaml` and `branding.seed.json` against the strict
 * schemas core owns before any file is written, so a value in the wrong file, an
 * unknown key or a malformed address fails the command and leaves nothing behind.
 *
 * An existing customer folder is never overwritten: it holds authored decisions
 * and, later, a live deployment's configuration.
 */
export async function tenantGenerator(
  tree: Tree,
  options: TenantGeneratorSchema
): Promise<void> {
  const { name, ...rest } = options;

  const files = renderTenant({ ...rest, slug: name });

  const root = `customers/${name}/deploy`;

  if (tree.exists(root)) {
    throw new Error(
      `${root} already exists. A customer folder is scaffolded once; edit it in place.`
    );
  }

  for (const [path, content] of files) {
    tree.write(path, content);
  }

  await Promise.resolve();
}

export default tenantGenerator;

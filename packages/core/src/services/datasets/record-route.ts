import { permissionKeyFor } from "../../lib/module-contract/keys.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { can } from "../authorization/index.ts";
import { findDataset } from "./registry.ts";

export type RecordRoute = { readonly label: string; readonly path: string };

/**
 * The page of the record behind one dataset row (R-11). The owning module's resolver names it, and
 * the caller gets it only when `can()` allows the page permission on the record. Every miss answers null.
 */
export async function recordRoute(
  ctx: ModuleRequestContext,
  input: { readonly dataset: string; readonly id: string }
): Promise<RecordRoute | null> {
  const found = await findDataset(ctx, input.dataset);

  if (found === undefined) return null;

  const ref = { type: found.declaration.recordKey.type, id: input.id };
  const descriptor = await ctx.caller.recordOf(ref);

  if (descriptor?.path === undefined) return null;

  const permission =
    descriptor.permission ?? permissionKeyFor(found.moduleId, "use");

  return (await can(ctx.caller, permission, ref))
    ? { label: descriptor.label, path: descriptor.path }
    : null;
}

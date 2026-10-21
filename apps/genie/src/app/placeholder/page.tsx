// The `.js` suffix is required: `apps/genie` is ESM and `next` ships no `exports`
// map, so NodeNext resolves a package subpath only when it carries an extension.
// Next's own generated `next/types.js` import uses the same form.
import { notFound } from "next/navigation.js";

import { pinnedRoutePermission } from "../../module-route.ts";
import { renderIfPermitted } from "../../page-access.tsx";
import { moduleById } from "../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts the workspace page the module declared under `pages.workspace.home`.
 * Resolving a file is not proof; this renders the registered component inside
 * the real server bundle, behind the one authorization seam the generic route
 * uses too.
 *
 * The required permission is pinned to the module's canonical id, not read from
 * the entry as declared, for the reason `pinnedRoutePermission` records.
 */
export default async function PlaceholderRoute() {
  const module = moduleById.get("placeholder");

  if (module === undefined) notFound();

  const permission = pinnedRoutePermission(module, "workspace", "/placeholder");

  if (permission === undefined) notFound();

  const Page = module.pages.workspace.home;

  if (Page === undefined) notFound();

  return renderIfPermitted(permission, () => <Page />);
}

// The `.js` suffix is required: `apps/genie` is ESM and `next` ships no `exports`
// map, so NodeNext resolves a package subpath only when it carries an extension.
// Next's own generated `next/types.js` import uses the same form.
import { notFound } from "next/navigation.js";

import { recordPageRequest, renderIfPermitted } from "../../page-access.tsx";
import { moduleById } from "../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts the workspace page the module declared under `pages.workspace.home`.
 * Resolving a file is not proof; this renders the registered component inside
 * the real server bundle, behind the one authorization seam.
 */
export default async function PlaceholderRoute() {
  recordPageRequest("/placeholder");

  const module = moduleById.get("placeholder");

  if (module === undefined) notFound();

  const entry = module.navigation.entries.find(
    (candidate) => candidate.path === "/placeholder"
  );

  if (entry === undefined) notFound();

  const Page = module.pages.workspace.home;

  if (Page === undefined) notFound();

  return renderIfPermitted(entry.requiredPermission, () => <Page />);
}

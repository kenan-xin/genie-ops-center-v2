// The `.js` suffix is required: `apps/genie` is ESM and `next` ships no `exports`
// map, so NodeNext resolves a package subpath only when it carries an extension.
import { notFound } from "next/navigation.js";

import { renderIfPermitted } from "../../../page-access.tsx";
import { moduleById } from "../../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts any compiled module's workspace page under `/m/<id>`, behind the one
 * authorization seam.
 *
 * A module that ships with the platform may keep a route file of its own, the way
 * the placeholder does. Every other module, including one a generator just wrote,
 * reaches the browser here without an edit to this application: the id comes from
 * the path, the component comes from the compiled registry, and the permission
 * comes from the entry the module declared. A module that is not in this image
 * has no entry in the registry and is not found, so an excluded module answers
 * nothing (R-22).
 *
 * The namespace mirrors `/api/m/<id>/...`, which the module contract already uses
 * for a module's inbound endpoints.
 */
export default async function ModuleWorkspaceRoute(props: {
  readonly params: Promise<{ readonly moduleId: string }>;
}) {
  const { moduleId } = await props.params;

  const module = moduleById.get(moduleId);

  if (module === undefined) notFound();

  // The permission is pinned to this module's own key rather than taken from the
  // entry as declared. A generic route answers for every compiled module, so a
  // declaration naming another module's key would otherwise reach this page with
  // a grant it was never given.
  const entry = module.navigation.entries.find(
    (candidate) =>
      candidate.surface === "workspace" &&
      candidate.path === `/m/${moduleId}` &&
      candidate.requiredPermission === `${moduleId}:use`
  );

  if (entry === undefined) notFound();

  const Page = module.pages.workspace.home;

  if (Page === undefined) notFound();

  return renderIfPermitted(entry.requiredPermission, () => <Page />);
}

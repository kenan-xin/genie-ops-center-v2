import { notFound } from "next/navigation.js";

import { pinnedRoutePermission } from "../../../../module-route.ts";
import { renderIfPermitted } from "../../../../page-access.tsx";
import { moduleById } from "../../../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts any compiled module's admin page under `/admin/m/<id>`, behind the same
 * seam as the workspace route beside it. The permission is pinned to the id's
 * own `<id>:admin` key, so a person who may use a module still does not reach
 * its administration, and a declaration naming another module's key cannot
 * supply the grant.
 */
export default async function ModuleAdminRoute(props: {
  readonly params: Promise<{ readonly moduleId: string }>;
}) {
  const { moduleId } = await props.params;

  const module = moduleById.get(moduleId);

  if (module === undefined) notFound();

  const permission = pinnedRoutePermission(
    module,
    "admin",
    `/admin/m/${moduleId}`
  );

  if (permission === undefined) notFound();

  const Page = module.pages.admin.settings;

  if (Page === undefined) notFound();

  return renderIfPermitted(permission, () => <Page />);
}

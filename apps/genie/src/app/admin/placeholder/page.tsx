import { notFound } from "next/navigation.js";

import { pinnedRoutePermission } from "../../../module-route.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { moduleById } from "../../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts the admin page the module declared under `pages.admin.settings`,
 * behind the same one authorization seam as the workspace page and the generic
 * admin route. The required permission is pinned to the module's canonical id,
 * never read from the entry as declared.
 */
export default async function PlaceholderAdminRoute() {
  const module = moduleById.get("placeholder");

  if (module === undefined) notFound();

  const permission = pinnedRoutePermission(
    module,
    "admin",
    "/admin/placeholder"
  );

  if (permission === undefined) notFound();

  const Page = module.pages.admin.settings;

  if (Page === undefined) notFound();

  return renderIfPermitted(permission, () => <Page />);
}

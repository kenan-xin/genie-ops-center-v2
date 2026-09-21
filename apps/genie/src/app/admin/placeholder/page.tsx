import { notFound } from "next/navigation.js";

import { renderIfPermitted } from "../../../page-access.tsx";
import { moduleById } from "../../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts the admin page the module declared under `pages.admin.settings`,
 * behind the same one authorization seam as the workspace page. The required
 * permission comes from the module's own declaration, never a literal here.
 */
export default async function PlaceholderAdminRoute() {
  const module = moduleById.get("placeholder");

  if (module === undefined) notFound();

  const entry = module.navigation.entries.find(
    (candidate) => candidate.path === "/admin/placeholder"
  );

  if (entry === undefined) notFound();

  const Page = module.pages.admin.settings;

  if (Page === undefined) notFound();

  return renderIfPermitted(entry.requiredPermission, () => <Page />);
}

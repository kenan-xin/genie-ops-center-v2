import { notFound } from "next/navigation.js";

import { renderIfPermitted } from "../../../../page-access.tsx";
import { moduleById } from "../../../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts any compiled module's admin page under `/admin/m/<id>`, behind the same
 * seam as the workspace route beside it. The admin entry declares `<id>:admin`,
 * so a person who may use a module still does not reach its administration.
 */
export default async function ModuleAdminRoute(props: {
  readonly params: Promise<{ readonly moduleId: string }>;
}) {
  const { moduleId } = await props.params;

  const module = moduleById.get(moduleId);

  if (module === undefined) notFound();

  const entry = module.navigation.entries.find(
    (candidate) =>
      candidate.surface === "admin" && candidate.path === `/admin/m/${moduleId}`
  );

  if (entry === undefined) notFound();

  const Page = module.pages.admin.settings;

  if (Page === undefined) notFound();

  return renderIfPermitted(entry.requiredPermission, () => <Page />);
}

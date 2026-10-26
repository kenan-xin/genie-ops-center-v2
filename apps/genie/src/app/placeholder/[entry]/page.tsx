import { notFound } from "next/navigation.js";

import { pinnedRoutePermission } from "../../../module-route.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { moduleById } from "../../../registry.ts";
import { ShellFrame } from "../../../shell-frame.tsx";

export const dynamic = "force-dynamic";

/**
 * Mounts the placeholder's further workspace entries, `/placeholder/<entry>`, behind the same one
 * authorization seam as its home page. A path the module never declared is not found, and the
 * page is the one the module registered under the path's last segment.
 */
export default async function PlaceholderEntryRoute(props: {
  readonly params: Promise<{ readonly entry: string }>;
}) {
  const { entry } = await props.params;

  const module = moduleById.get("placeholder");

  if (module === undefined) notFound();

  const permission = pinnedRoutePermission(
    module,
    "workspace",
    `/placeholder/${entry}`
  );

  if (permission === undefined) notFound();

  const Page = module.pages.workspace[entry];

  if (Page === undefined) notFound();

  const content = await renderIfPermitted(permission, () => <Page />);

  return <ShellFrame chrome="workspace">{content}</ShellFrame>;
}

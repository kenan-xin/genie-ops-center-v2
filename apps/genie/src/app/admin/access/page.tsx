import { coreAdminPermission } from "@genie/core";
import { accessOverviewHref } from "@genie/core/features/access";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation.js";

import { renderIfPermitted } from "../../../page-access.tsx";
import { AccessRoute } from "./access-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("access.title") };
}

/**
 * The Access screen, behind `core:roles:manage` (R-37e). Its navigation entry shares the Roles key,
 * because Access is the one screen that writes who holds a role (DEC-39). The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts, and every procedure checks again.
 * A module or role link that names no recipient goes to the Overview, which checks the same key
 * (`d8l5.46`). In a page, `redirect` replaces the history entry, so Back skips the hop.
 */
export default async function AccessPage(props: {
  readonly searchParams: Promise<{
    readonly recipient?: string;
    readonly module?: string;
    readonly role?: string;
  }>;
}) {
  const { recipient, module, role } = await props.searchParams;

  if (recipient === undefined && (module !== undefined || role !== undefined)) {
    redirect(accessOverviewHref({ module, role }));
  }

  return renderIfPermitted(coreAdminPermission("core-access"), async () => (
    <main>
      <AccessRoute />
    </main>
  ));
}

import { type PermissionKey } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { ShellFrame } from "../../../shell-frame.tsx";
import { RolesRoute } from "./roles-route.tsx";

export const dynamic = "force-dynamic";

/** The one key the route opens behind (R-37). */
const ROLES_MANAGE: PermissionKey = "core:roles:manage";

/**
 * The Roles screen, behind `core:roles:manage`. It edits role definitions only; who holds a role
 * is decided in Access, the one assignment writer (DEC-39). The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts.
 */
export default async function RolesPage() {
  const content = await renderIfPermitted(ROLES_MANAGE, async (caller) => {
    const branding = await requireContext().tenant.branding.get();
    const t = await getTranslations("pages");

    return (
      <main>
        <PageHeader
          title={t("roles.title")}
          description={t("roles.description")}
        />
        <RolesRoute
          viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
        />
      </main>
    );
  });

  return <ShellFrame chrome="admin">{content}</ShellFrame>;
}

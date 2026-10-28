import { coreAdminPermission } from "@genie/core";
import { EMPTY_AUDIT_FILTERS } from "@genie/core/features/audit";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { ShellFrame } from "../../../shell-frame.tsx";
import { AuditLogRoute } from "./audit-log-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("audit.title") };
}

/**
 * The Audit log screen, behind `core:audit:read` (R-67, DEC-16). The one authorization seam
 * refuses an anonymous request before the screen mounts, so the route renders a denied state that
 * reveals nothing it would have shown.
 *
 * The viewer is the signed-in person: their id comes from this request's session (S2-04). Their
 * time zone is the deployment's `tenant_branding.default_time_zone` until Section 3 gives each
 * person a preference (R-53); that is the tenant-owned value the rest of the product already uses
 * for a person without one. Both reads happen inside `render`, so an unpermitted viewer reads
 * neither.
 */
export default async function AuditLogPage() {
  const content = await renderIfPermitted(
    coreAdminPermission("core-audit"),
    async (caller) => {
      const branding = await requireContext().tenant.branding.get();
      const t = await getTranslations("pages");

      return (
        <main>
          <PageHeader
            title={t("audit.title")}
            description={t("audit.description")}
          />
          <AuditLogRoute
            viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
            initialFilters={EMPTY_AUDIT_FILTERS}
          />
        </main>
      );
    }
  );

  return <ShellFrame chrome="admin">{content}</ShellFrame>;
}

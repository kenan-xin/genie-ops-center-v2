import { can, coreAdminPermission } from "@genie/core";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../../context.ts";
import { renderIfPermitted } from "../../../../page-access.tsx";
import { OverviewRoute } from "./overview-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("access.title") };
}

/**
 * The Overview tab of Access, behind `core:roles:manage` like Grants (R-37e). It reads and writes
 * nothing before the administrator picks a subject. The audit link shows only to a viewer who
 * holds `core:audit:read` (O10), and dates use the tenant's default time zone (O11).
 */
export default async function AccessOverviewPage() {
  return renderIfPermitted(
    coreAdminPermission("core-access"),
    async (caller) => {
      const branding = await requireContext().tenant.branding.get();

      return (
        <main>
          <OverviewRoute
            timeZone={branding.defaultTimeZone}
            auditLog={await can(caller, coreAdminPermission("core-audit"))}
          />
        </main>
      );
    }
  );
}

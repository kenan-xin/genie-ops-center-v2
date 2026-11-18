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
 * The Overview tab of Access, behind `core:roles:manage` like Grants (R-37e). It opens on every
 * assignment, newest first, filtered by the address (d8l5.62). A name links to People, Groups or
 * Roles only for a viewer who may open that screen (P12-20), and dates use the tenant's default
 * time zone (O11).
 */
export default async function AccessOverviewPage() {
  return renderIfPermitted(
    coreAdminPermission("core-access"),
    async (caller) => {
      const branding = await requireContext().tenant.branding.get();

      const [roles, people, groups] = await Promise.all([
        can(caller, coreAdminPermission("core-roles")),
        can(caller, coreAdminPermission("core-people")),
        can(caller, coreAdminPermission("core-groups")),
      ]);

      return (
        <main>
          <OverviewRoute
            timeZone={branding.defaultTimeZone}
            links={{ roles, people, groups }}
          />
        </main>
      );
    }
  );
}

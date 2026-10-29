import { coreAdminPermission } from "@genie/core";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { RolesRoute } from "./roles-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("roles.title") };
}

/**
 * The Roles screen, behind `core:roles:manage`. It edits role definitions only; who holds a role
 * is decided in Access, the one assignment writer (DEC-39). The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts.
 */
export default async function RolesPage() {
  return renderIfPermitted(
    coreAdminPermission("core-roles"),
    async (caller) => {
      const branding = await requireContext().tenant.branding.get();

      // The route renders the header, because Role detail adds the trail to it.
      return (
        <main>
          <RolesRoute
            viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
          />
        </main>
      );
    }
  );
}

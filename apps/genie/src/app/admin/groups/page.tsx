import { coreAdminPermission } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { GroupsRoute } from "./groups-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("groups.title") };
}

/**
 * The Groups screen, behind `core:groups:manage`. The one authorization seam refuses an anonymous
 * or unpermitted request before the screen mounts, so the route reveals nothing it would show.
 * The viewer is the signed-in person; the time zone is the deployment's default until Section 3
 * gives each person a preference.
 */
export default async function GroupsPage() {
  return renderIfPermitted(
    coreAdminPermission("core-groups"),
    async (caller) => {
      const branding = await requireContext().tenant.branding.get();
      const t = await getTranslations("pages");

      return (
        <main>
          <PageHeader
            title={t("groups.title")}
            description={t("groups.description")}
          />
          <GroupsRoute
            viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
          />
        </main>
      );
    }
  );
}

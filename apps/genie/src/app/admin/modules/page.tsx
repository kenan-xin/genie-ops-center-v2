import { can, coreAdminPermission } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { renderIfPermitted } from "../../../page-access.tsx";
import { ModulesRoute } from "./modules-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("modules.title") };
}

/**
 * The Modules screen, behind `core:settings:manage`. The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts, and every procedure re-checks it.
 * The holders link to Access only for a caller who holds its key (R-37e).
 */
export default async function ModulesPage() {
  return renderIfPermitted(
    coreAdminPermission("core-modules"),
    async (caller) => {
      const t = await getTranslations("pages");

      return (
        <main>
          <PageHeader
            title={t("modules.title")}
            description={t("modules.description")}
          />
          <ModulesRoute
            canManageAccess={await can(
              caller,
              coreAdminPermission("core-access")
            )}
          />
        </main>
      );
    }
  );
}

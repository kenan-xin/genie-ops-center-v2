import { type PermissionKey } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { renderIfPermitted } from "../../../page-access.tsx";
import { ShellFrame } from "../../../shell-frame.tsx";
import { CategoriesRoute } from "./categories-route.tsx";

export const dynamic = "force-dynamic";

/** The one key the route opens behind (R-87, R-93). */
const SETTINGS_MANAGE: PermissionKey = "core:settings:manage";

/**
 * The Categories screen, behind `core:settings:manage`. The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts, and every procedure re-checks it.
 */
export default async function CategoriesPage() {
  const content = await renderIfPermitted(SETTINGS_MANAGE, async () => {
    const t = await getTranslations("pages");

    return (
      <main>
        <PageHeader
          title={t("categories.title")}
          description={t("categories.description")}
        />
        <CategoriesRoute />
      </main>
    );
  });

  return <ShellFrame chrome="admin">{content}</ShellFrame>;
}

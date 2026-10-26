import { coreAdminPermission } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { ShellFrame } from "../../../shell-frame.tsx";
import { SettingsRoute } from "./settings-route.tsx";

export const dynamic = "force-dynamic";

/**
 * The Tenant Settings screen, behind `core:settings:manage`. The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts, and every procedure re-checks it. A
 * section's own key is checked by the read (R-72, R-93). The time zone is the deployment's default until a person has a preference.
 */
export default async function SettingsPage() {
  const content = await renderIfPermitted(
    coreAdminPermission("core-settings"),
    async () => {
      const branding = await requireContext().tenant.branding.get();
      const t = await getTranslations("pages");

      return (
        <main>
          <PageHeader
            title={t("settings.title")}
            description={t("settings.description")}
          />
          <SettingsRoute timeZone={branding.defaultTimeZone} />
        </main>
      );
    }
  );

  return <ShellFrame chrome="admin">{content}</ShellFrame>;
}

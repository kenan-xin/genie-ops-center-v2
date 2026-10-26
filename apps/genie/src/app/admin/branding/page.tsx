import { coreAdminPermission } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { ShellFrame } from "../../../shell-frame.tsx";
import { BrandingRoute } from "./branding-route.tsx";

export const dynamic = "force-dynamic";

/**
 * The Branding screen, behind `core:branding:manage`. The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts. The time zone is the deployment's
 * default until a person has a preference.
 */
export default async function BrandingPage() {
  const content = await renderIfPermitted(
    coreAdminPermission("core-branding"),
    async () => {
      const branding = await requireContext().tenant.branding.get();
      const t = await getTranslations("pages");

      return (
        <main>
          <PageHeader
            title={t("branding.title")}
            description={t("branding.description")}
          />
          <BrandingRoute timeZone={branding.defaultTimeZone} />
        </main>
      );
    }
  );

  return <ShellFrame chrome="admin">{content}</ShellFrame>;
}

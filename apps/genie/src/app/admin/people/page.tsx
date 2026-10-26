import { coreAdminPermission } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { ShellFrame } from "../../../shell-frame.tsx";
import { PeopleRoute } from "./people-route.tsx";

export const dynamic = "force-dynamic";

/**
 * The People screen, behind `core:people:manage`. The one authorization seam refuses an anonymous
 * or unpermitted request before the screen mounts, so the route reveals nothing it would show. The
 * onboarding mode and the local-accounts setting are read once here through the tenant readers
 * (DEC-46) and handed to the Add person dialog; the server re-checks every write.
 */
export default async function PeoplePage() {
  const content = await renderIfPermitted(
    coreAdminPermission("core-people"),
    async (caller) => {
      const tenant = requireContext().tenant;
      const t = await getTranslations("pages");

      const branding = await tenant.branding.get();
      const settings = await tenant.settings.get();

      return (
        <main>
          <PageHeader
            title={t("people.title")}
            description={t("people.description")}
          />
          <PeopleRoute
            viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
            settings={{
              onboardingMode:
                settings.onboardingMode === "jit" ? "jit" : "invite",
              localAccountsEnabled: settings.localAccountsEnabled,
            }}
          />
        </main>
      );
    }
  );

  return <ShellFrame chrome="admin">{content}</ShellFrame>;
}

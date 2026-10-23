import { loadShell, type ShellModel } from "@genie/core";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { requireContext } from "./context.ts";
import { documentPrincipal } from "./document-session.ts";
import { modules } from "./registry.ts";

/**
 * The request's shell model, built once per request through React's request-scoped `cache`, so the
 * home page's landing check and the frame share one navigation tree pass (R-30). Core admin labels
 * come from the catalogue (R-41); each key is a literal so the coverage check can read it.
 */
export const shellModel = cache(async (): Promise<ShellModel> => {
  const t = await getTranslations("shell");

  return loadShell({
    tenant: requireContext().tenant,
    modules,
    caller: await documentPrincipal(),
    labels: {
      coreEntries: {
        "core-people": t("coreNavigation.people"),
        "core-groups": t("coreNavigation.groups"),
        "core-roles": t("coreNavigation.roles"),
        "core-branding": t("coreNavigation.branding"),
        "core-settings": t("coreNavigation.settings"),
        "core-audit": t("coreNavigation.audit"),
        "core-modules": t("coreNavigation.modules"),
        "core-categories": t("coreNavigation.categories"),
      },
      coreGroups: {
        "people-and-access": t("adminGroups.peopleAndAccess"),
        "tenant": t("adminGroups.tenant"),
        "catalog": t("adminGroups.catalog"),
      },
    },
  });
});

import { NavigationList } from "@genie/ui";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../context.ts";
import { enabledNavigation } from "../navigation.ts";
import { modules } from "../registry.ts";

export const dynamic = "force-dynamic";

/**
 * The ordinary document. Navigation hides every module whose entitlement is off (R-8); a module
 * that is switched on shows all of its declared entries (R-23).
 *
 * AC-26, across real bundles. This page's own server bundle stamps the id it read onto the
 * document it renders. The proxy never writes this attribute, so a second context in this bundle
 * would render a different value here even while every proxy log line agreed with itself.
 *
 * Every user-facing string resolves through the catalogue, never a direct JSON
 * import, because R-43 requires the catalogue to be the one path for text.
 */
export default async function HomePage() {
  const t = await getTranslations("app");
  const { contextId, tenant } = requireContext();

  const items = await enabledNavigation({
    entitlements: tenant.entitlements,
    modules,
  });

  return (
    <main data-context-id={contextId}>
      <h1>{t("title")}</h1>
      <NavigationList
        heading={t("navigationHeading")}
        items={items}
        emptyMessage={t("noModules")}
      />
    </main>
  );
}

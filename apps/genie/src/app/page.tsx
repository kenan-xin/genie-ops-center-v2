import { NavigationList } from "@genie/ui";
import { getTranslations } from "next-intl/server";

import { requireContext } from "../context.ts";
import { modules } from "../registry.ts";

export const dynamic = "force-dynamic";

/**
 * The ordinary document. Navigation is unfiltered in Section 0 (R-23).
 *
 * Every user-facing string resolves through the catalogue, never a direct JSON
 * import, because R-43 requires the catalogue to be the one path for text.
 */
export default async function HomePage() {
  const t = await getTranslations("app");

  const items = modules.flatMap((module) =>
    module.navigation.entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      path: entry.path,
    }))
  );

  // AC-26, across real bundles. This page's own server bundle stamps the id it
  // read onto the document it renders. The proxy never writes this attribute, so
  // a second context in this bundle would render a different value here even
  // while every proxy log line agreed with itself.
  const { contextId } = requireContext();

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

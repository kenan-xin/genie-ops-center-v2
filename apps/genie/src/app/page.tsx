import { NavigationList } from "@genie/ui";
import { getTranslations } from "next-intl/server";

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

  return (
    <main>
      <h1>{t("title")}</h1>
      <NavigationList
        heading={t("navigationHeading")}
        items={items}
        emptyMessage={t("noModules")}
      />
    </main>
  );
}

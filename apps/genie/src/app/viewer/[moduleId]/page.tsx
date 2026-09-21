import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation.js";

import { viewerModuleIds } from "../../../registry.ts";
import { viewerRouteFor } from "../../../viewer-routes.ts";

export const dynamic = "force-dynamic";

/**
 * The Section 0 viewer fixture. Entering it is a full document navigation, so
 * the response installs the viewer policy before the frame renders (R-49).
 *
 * The route mapping takes the id set explicitly, because `viewer-routes.ts`
 * imports nothing. In the server bundle the set comes from the registry. The
 * proxy reads the same set from the published context slot.
 */
export default async function ViewerPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;

  if (viewerRouteFor(`/viewer/${moduleId}`, viewerModuleIds) === undefined) {
    notFound();
  }

  const t = await getTranslations("viewer");

  return (
    <main>
      <h1>{t("heading")}</h1>
      <iframe
        title={t("frameTitle")}
        src="https://embed.placeholder.example.com/fixture"
        width="320"
        height="180"
      />
    </main>
  );
}

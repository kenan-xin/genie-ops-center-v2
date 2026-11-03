import { coreAdminPermission } from "@genie/core";
import { getTranslations } from "next-intl/server";

import { renderIfPermitted } from "../../../page-access.tsx";
import { AccessRoute } from "./access-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("access.title") };
}

/**
 * The Access screen, behind `core:roles:manage` (R-37e). It shares the Roles key, because it is
 * the one screen that writes who holds a role (DEC-39). The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts, and every procedure checks again.
 */
export default async function AccessPage() {
  return renderIfPermitted(coreAdminPermission("core-roles"), async () => (
    <main>
      <AccessRoute />
    </main>
  ));
}

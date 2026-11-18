import { coreAdminPermission } from "@genie/core";
import { getTranslations } from "next-intl/server";

import { renderIfPermitted } from "../../../../page-access.tsx";
import { AccessRoute } from "../access-route.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tMeta = await getTranslations("pages");

  return { title: tMeta("access.title") };
}

/**
 * The Grants tab of Access, behind `core:roles:manage` (R-37e). Its navigation entry shares the
 * Roles key, because Access is the one screen that writes who holds a role (DEC-39). It opens on
 * every group and person (P12-17), and every procedure checks the key again.
 */
export default async function AccessGrantsPage() {
  return renderIfPermitted(coreAdminPermission("core-access"), async () => (
    <main>
      <AccessRoute />
    </main>
  ));
}

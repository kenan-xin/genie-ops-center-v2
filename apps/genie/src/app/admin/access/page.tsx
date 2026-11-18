import { coreAdminPermission } from "@genie/core";
import { accessLandingHref } from "@genie/core/features/access";
import { redirect } from "next/navigation.js";

import { renderIfPermitted } from "../../../page-access.tsx";

export const dynamic = "force-dynamic";

/**
 * The address of the Access navigation entry (P12-9), behind `core:roles:manage` (R-37e). It
 * renders nothing: a link that names a recipient goes to Grants with every parameter, and any
 * other goes to the Overview, the landing tab (`d8l5.46`). The entry keeps this address, so the
 * rail's longest-prefix match marks Access on both tabs. In a page, `redirect` replaces the
 * history entry, so Back skips the hop.
 */
export default async function AccessPage(props: {
  readonly searchParams: Promise<
    Readonly<Record<string, string | string[] | undefined>>
  >;
}) {
  const params = await props.searchParams;

  return renderIfPermitted(coreAdminPermission("core-access"), () =>
    redirect(accessLandingHref(params))
  );
}

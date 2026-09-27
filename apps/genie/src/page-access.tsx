import { type PermissionKey, can } from "@genie/core";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { requireContext } from "./context.ts";
import { requestPrincipal } from "./request-principal.ts";

/**
 * The page loader of R-27. One principal per request, read lazily once, and the single
 * authorization seam of DEC-39. A workspace entry requires `<id>:use` and an admin page
 * `<id>:admin`; a person without the key gets the denied response, and the route stays mounted
 * (R-35).
 */
export async function renderIfPermitted(
  permission: PermissionKey,
  render: () => ReactNode
): Promise<ReactNode> {
  const caller = requestPrincipal(requireContext().tenant);

  if (!(await can(caller, permission))) {
    const t = await getTranslations("access");

    // Denied pages say nothing about what they would have shown.
    return <main data-testid="permission-denied">{t("denied")}</main>;
  }

  return render();
}

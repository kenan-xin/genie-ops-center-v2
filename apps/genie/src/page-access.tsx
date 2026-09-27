import { type PermissionKey, type RequestPrincipal, can } from "@genie/core";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import type { ReactNode } from "react";

import { requireContext } from "./context.ts";
import { requestPrincipal } from "./request-principal.ts";

/**
 * The page loader of R-27. One principal per request, read lazily once, and the single
 * authorization seam of DEC-39. A workspace entry requires `<id>:use` and an admin page
 * `<id>:admin`; a person without the key gets the denied response, and the route stays mounted
 * (R-35).
 *
 * The caller is handed to `render`, so a page that needs the signed-in person's own values (the
 * audit page's viewer, for example) reads the same request principal the check used rather than
 * building a second one, and those reads happen only after the check passes.
 */
export async function renderIfPermitted(
  permission: PermissionKey,
  render: (caller: RequestPrincipal) => ReactNode | Promise<ReactNode>
): Promise<ReactNode> {
  const caller = await requestPrincipal(
    requireContext().tenant,
    await headers()
  );

  if (!(await can(caller, permission))) {
    const t = await getTranslations("access");

    // Denied pages say nothing about what they would have shown.
    return <main data-testid="permission-denied">{t("denied")}</main>;
  }

  return render(caller);
}

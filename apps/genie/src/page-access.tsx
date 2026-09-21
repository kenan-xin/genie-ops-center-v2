import {
  type PermissionKey,
  can,
  createRequestPrincipal,
  createStubGrantReader,
} from "@genie/core";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * The page loader of R-14. One principal per request, read lazily once, and the
 * single authorization seam of DEC-39.
 *
 * Section 0 has no sign-in, so the caller is anonymous and the stub grants
 * exactly one key, `placeholder:read` (R-13). A workspace entry requires
 * `<id>:use` and an admin page requires `<id>:admin`, so both module pages are
 * refused here. That refusal is the Section 0 behavior, not a defect: the module
 * contract says only the placeholder's read procedure has an authorized success
 * path until Section 2 supplies real roles.
 */
export async function renderIfPermitted(
  permission: PermissionKey,
  render: () => ReactNode
): Promise<ReactNode> {
  const caller = createRequestPrincipal(
    { userId: "anonymous", groups: [] },
    createStubGrantReader()
  );

  if (!(await can(caller, permission))) {
    const t = await getTranslations("access");

    // Denied pages say nothing about what they would have shown.
    return <main data-testid="permission-denied">{t("denied")}</main>;
  }

  return render();
}

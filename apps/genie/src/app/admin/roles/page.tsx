import { type PermissionKey } from "@genie/core";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { RolesRoute } from "./roles-route.tsx";

export const dynamic = "force-dynamic";

/** The one key the route opens behind (R-37). */
const ROLES_MANAGE: PermissionKey = "core:roles:manage";

/**
 * The Roles screen, behind `core:roles:manage`. It edits role definitions only; who holds a role
 * is decided in Access, the one assignment writer (DEC-39). The one authorization seam refuses an
 * anonymous or unpermitted request before the screen mounts.
 */
export default async function RolesPage() {
  return renderIfPermitted(ROLES_MANAGE, async (caller) => {
    const branding = await requireContext().tenant.branding.get();

    return (
      <main>
        <h1>Roles</h1>
        <p>
          Named sets of permission keys. A system role is read-only and
          copyable; a custom role is yours to edit. Who holds a role is decided
          in Access.
        </p>
        <RolesRoute
          viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
        />
      </main>
    );
  });
}

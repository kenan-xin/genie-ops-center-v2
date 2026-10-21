import { type PermissionKey } from "@genie/core";
import { EMPTY_AUDIT_FILTERS } from "@genie/core/features/audit";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { AuditLogRoute } from "./audit-log-route.tsx";

export const dynamic = "force-dynamic";

/** The one key the route opens behind (R-67, DEC-16). */
const AUDIT_READ_PERMISSION: PermissionKey = "core:audit:read";

/**
 * The Audit log screen, behind `core:audit:read` (R-67, DEC-16). The one authorization seam
 * refuses an anonymous request before the screen mounts, so the route renders a denied state that
 * reveals nothing it would have shown.
 *
 * The viewer is the signed-in person: their id comes from this request's session (S2-04). Their
 * time zone is the deployment's `tenant_branding.default_time_zone` until Section 3 gives each
 * person a preference (R-53); that is the tenant-owned value the rest of the product already uses
 * for a person without one. Both reads happen inside `render`, so an unpermitted viewer reads
 * neither.
 */
export default async function AuditLogPage() {
  return renderIfPermitted(AUDIT_READ_PERMISSION, async (caller) => {
    const branding = await requireContext().tenant.branding.get();

    return (
      <main>
        <h1>Audit log</h1>
        <p>
          Who did what, when, on which record. Events are kept for the
          tenant&apos;s lifetime and never edited.
        </p>
        <AuditLogRoute
          viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
          initialFilters={EMPTY_AUDIT_FILTERS}
        />
      </main>
    );
  });
}

import type { PermissionKey } from "@genie/core";
import { EMPTY_AUDIT_FILTERS } from "@genie/core/features/audit";

import { renderIfPermitted } from "../../../page-access.tsx";
import { AuditLogRoute } from "./audit-log-route.tsx";

export const dynamic = "force-dynamic";

/** The one key the route opens behind (R-67, DEC-16). */
const AUDIT_READ_PERMISSION: PermissionKey = "core:audit:read";

/**
 * The Audit log screen, behind `core:audit:read` (R-67, DEC-16). The one authorization seam
 * refuses an anonymous request before the screen mounts, so the route renders a denied state that
 * reveals nothing it would have shown. The signed-in browser proof at both viewports is S2-16.
 *
 * The viewer's display name is unused by the screen; its time zone reaches the rendering. Both are
 * placeholders until sign-in exists (S2-04) to supply the signed-in person's own values.
 */
export default async function AuditLogPage() {
  return renderIfPermitted(AUDIT_READ_PERMISSION, () => (
    <main>
      <h1>Audit log</h1>
      <p>
        Who did what, when, on which record. Events are kept for the
        tenant&apos;s lifetime and never edited.
      </p>
      <AuditLogRoute
        viewer={{ id: "viewer", timeZone: "UTC" }}
        initialFilters={EMPTY_AUDIT_FILTERS}
      />
    </main>
  ));
}

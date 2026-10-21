import { type PermissionKey } from "@genie/core";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { GroupsRoute } from "./groups-route.tsx";

export const dynamic = "force-dynamic";

/** The one key the route opens behind (R-37). */
const GROUPS_MANAGE: PermissionKey = "core:groups:manage";

/**
 * The Groups screen, behind `core:groups:manage`. The one authorization seam refuses an anonymous
 * or unpermitted request before the screen mounts, so the route reveals nothing it would show.
 * The viewer is the signed-in person; the time zone is the deployment's default until Section 3
 * gives each person a preference.
 */
export default async function GroupsPage() {
  return renderIfPermitted(GROUPS_MANAGE, async (caller) => {
    const branding = await requireContext().tenant.branding.get();

    return (
      <main>
        <h1>Groups</h1>
        <p>
          Directory groups from the identity provider, and local groups you
          manage here. A role assigned to a group reaches every member.
        </p>
        <GroupsRoute
          viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
        />
      </main>
    );
  });
}

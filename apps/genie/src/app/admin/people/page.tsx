import { type PermissionKey } from "@genie/core";

import { requireContext } from "../../../context.ts";
import { renderIfPermitted } from "../../../page-access.tsx";
import { PeopleRoute } from "./people-route.tsx";

export const dynamic = "force-dynamic";

/** The one key the route opens behind (R-37). */
const PEOPLE_MANAGE: PermissionKey = "core:people:manage";

/**
 * The People screen, behind `core:people:manage`. The one authorization seam refuses an anonymous
 * or unpermitted request before the screen mounts, so the route reveals nothing it would show. The
 * onboarding mode and the local-accounts setting are read once here through the tenant readers
 * (DEC-46) and handed to the Add person dialog; the server re-checks every write.
 */
export default async function PeoplePage() {
  return renderIfPermitted(PEOPLE_MANAGE, async (caller) => {
    const tenant = requireContext().tenant;

    const branding = await tenant.branding.get();
    const settings = await tenant.settings.get();

    return (
      <main>
        <h1>People</h1>
        <p>
          Everyone who can sign in. Add a person, give them roles, and revoke
          access when they leave. A pending person becomes active at their first
          sign-in.
        </p>
        <PeopleRoute
          viewer={{ id: caller.userId, timeZone: branding.defaultTimeZone }}
          settings={{
            onboardingMode:
              settings.onboardingMode === "jit" ? "jit" : "invite",
            localAccountsEnabled: settings.localAccountsEnabled,
          }}
        />
      </main>
    );
  });
}

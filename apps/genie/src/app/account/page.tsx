import { readOwnGroups, readRoleSummaries, realmAccountUrl } from "@genie/core";
import { getTranslations } from "next-intl/server";

import { requireAuth } from "../../auth.ts";
import { requireContext } from "../../context.ts";
import { documentPrincipal, requireSession } from "../../document-session.ts";
import { ShellFrame } from "../../shell-frame.tsx";
import { AccountRoute } from "./account-route.tsx";

export const dynamic = "force-dynamic";

/**
 * The account page (R-18): the person's own Profile, Sessions with per-session sign-out and sign
 * out everywhere, and the read-only Roles and access. Any signed-in person may read it; no
 * permission key guards a person's own account, and the page edits nothing.
 *
 * `requireSession()` decides where a visitor without a live session goes: a session past the idle
 * window lands on the session-expired banner, also on an in-app navigation
 * (genie-ops-center-v2-jfq9), and a request that never carried one lands on the plain sign-in
 * page (ARCH-1). The roles summary reads through the R-27 loader's seam -
 * the same per-request principal the rest of the application builds - with each scoped row's
 * label resolved by the record type's owning module (R-28).
 */
export default async function AccountPage() {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  const signedIn = await requireSession();

  const t = await getTranslations("account");
  const tPages = await getTranslations("pages");

  const userId = signedIn.user.id;

  const tenant = app.tenant;

  const principal = await documentPrincipal();

  const [groups, summaries, sessions, branding] = await Promise.all([
    readOwnGroups(tenant, userId),
    readRoleSummaries(principal),
    auth.listOwnSessions({ session: signedIn }),
    tenant.branding.get(),
  ]);

  const roleGrants = await Promise.all(
    (summaries ?? []).map(async (grant) => ({
      roleName: grant.roleName,
      moduleName: grant.moduleName,
      permissionCount: grant.permissionCount,
      scopeLabel:
        grant.scopeType === null || grant.scopeId === null
          ? t("wholeTenant")
          : ((
              await principal.recordOf({
                type: grant.scopeType,
                id: grant.scopeId,
              })
            )?.label ?? `${grant.scopeType}:${grant.scopeId}`),
      via: grant.via,
    }))
  );

  const settings = await tenant.settings.get();

  const accountManagementUrl = realmAccountUrl({
    settings,
    publicUrl: tenant.env.publicUrl,
    realm: tenant.env.auth?.keycloakRealm,
  });

  return (
    <ShellFrame chrome="workspace" title={tPages("account.title")}>
      <AccountRoute
        profile={{
          name: signedIn.user.name,
          email: signedIn.user.email,
        }}
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          source: group.source,
        }))}
        sessions={sessions.map((session) => ({
          id: session.id,
          device: session.device,
          browser: session.browser,
          ipAddress: session.ipAddress,
          signedInAt: session.signedInAt.toISOString(),
          lastActiveAt: session.lastActiveAt.toISOString(),
          isCurrent: session.isCurrent,
        }))}
        roleGrants={roleGrants}
        accountManagementUrl={accountManagementUrl}
        timeZone={branding.defaultTimeZone}
        nowIso={new Date().toISOString()}
      />
    </ShellFrame>
  );
}

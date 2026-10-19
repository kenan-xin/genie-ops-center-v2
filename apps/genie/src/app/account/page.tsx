import { principalFor, readOwnGroups, readRoleSummaries } from "@genie/core";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation.js";

import { requireAuth, SIGN_IN_PATH } from "../../auth.ts";
import { requireContext } from "../../context.ts";
import { documentSessionState } from "../../document-session.ts";
import { modules } from "../../registry.ts";
import { AccountRoute } from "./account-route.tsx";

export const dynamic = "force-dynamic";

/**
 * Where an idle session goes: the route that clears its cookie and shows the expired banner (R-14,
 * R-17a). The root layout redirects there too. On an in-app navigation the layout does not run
 * again, so this page's redirect is the one the browser follows, and it must clear the cookie as
 * well (genie-ops-center-v2-jfq9).
 */
const EXPIRED_PATH = "/api/auth/session-expired";

/**
 * The account page (R-18): the person's own Profile, Sessions with per-session sign-out and sign
 * out everywhere, and the read-only Roles and access. Any signed-in person may read it; no
 * permission key guards a person's own account, and the page edits nothing.
 *
 * The one enforced session read decides where an unauthenticated visitor goes: a session past
 * the idle window lands on the session-expired banner, and a request that never carried one
 * lands on the plain sign-in page. The roles summary reads through the R-27 loader's seam -
 * the same per-request principal the rest of the application builds - with each scoped row's
 * label resolved by the record type's owning module (R-28).
 */
export default async function AccountPage() {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  const state = await documentSessionState();

  if (state.status === "idle-expired") redirect(EXPIRED_PATH);

  if (state.status === "anonymous") redirect(SIGN_IN_PATH);

  const t = await getTranslations("account");

  const userId = state.session.user.id;

  const tenant = app.tenant;

  const principal = principalFor({
    tenant,
    modules,
    userId,
    // The enforced read above returned an authenticated state, or this page redirected away.
    authenticated: true,
  });

  const [groups, summaries, sessions, branding] = await Promise.all([
    readOwnGroups(tenant, userId),
    readRoleSummaries(principal),
    auth.listOwnSessions({ session: state.session }),
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

  // The realm's own account page, which only a local-account tenant links from Profile (R-18).
  const realmAccountUrl =
    settings.localAccountsEnabled && settings.realmSupportsLocalAccounts
      ? `${settings.keycloakUrlAtSetup ?? tenant.env.publicUrl}/realms/${tenant.env.auth?.keycloakRealm ?? "genie"}/account`
      : null;

  return (
    <AccountRoute
      profile={{
        name: state.session.user.name,
        email: state.session.user.email,
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
      accountManagementUrl={realmAccountUrl}
      timeZone={branding.defaultTimeZone}
      nowIso={new Date().toISOString()}
    />
  );
}

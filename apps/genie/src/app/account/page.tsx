import { principalFor, readOwnGroups, readRoleSummaries } from "@genie/core";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { requireAuth, SIGN_IN_PATH } from "../../auth.ts";
import { requireContext } from "../../context.ts";
import { modules } from "../../registry.ts";
import { AccountRoute } from "./account-route.tsx";

export const dynamic = "force-dynamic";

/** The sign-in page a dead session lands on, with the cause the banner names (R-14, R-17a). */
const EXPIRED_PATH = `${SIGN_IN_PATH}?error=session_expired`;

/**
 * The account page (R-18): the person's own Profile, Sessions with per-session sign-out and sign
 * out everywhere, and the read-only Roles and access. Any signed-in person may read it; no
 * permission key guards a person's own account, and the page edits nothing.
 *
 * The one enforced session read decides where an unauthenticated visitor goes: a session the
 * idle rule just deleted lands on the session-expired banner, and a request that never carried
 * one lands on the plain sign-in page. The roles summary reads through the R-27 loader's seam -
 * the same per-request principal the rest of the application builds - with each scoped row's
 * label resolved by the record type's owning module (R-28).
 */
export default async function AccountPage() {
  const app = requireContext();
  const auth = requireAuth(app.tenant);
  const requestHeaders = await headers();

  const state = await auth.sessionState({ headers: requestHeaders });

  if (state.status === "idle-expired") redirect(EXPIRED_PATH);

  if (state.status === "anonymous") redirect(SIGN_IN_PATH);

  const t = await getTranslations("account");

  const userId = state.session.user.id;

  const tenant = app.tenant;

  const principal = principalFor({ tenant, modules, userId });

  const [groups, summaries, sessions, branding] = await Promise.all([
    readOwnGroups(tenant, userId),
    readRoleSummaries(principal),
    auth.listOwnSessions({ headers: requestHeaders }),
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
      sessions={(sessions ?? []).map((session) => ({
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

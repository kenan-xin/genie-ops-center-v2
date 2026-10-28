import type {
  ShellIdentity,
  ShellLink,
  ShellNavigation,
} from "../../features/shell/types.ts";
import {
  type SupportContact,
  supportContact,
} from "../../lib/branding/support.ts";
import type { CoreAdminGroupId } from "../../lib/entitlement/core-admin.ts";
import { CORE_ADMIN_NAVIGATION } from "../../lib/entitlement/core-admin.ts";
import {
  CORE_NAVIGATION_ID,
  type PermittedEntry,
} from "../../lib/entitlement/index.ts";
import {
  type NavigationTree,
  navigationTree,
} from "../../lib/entitlement/tree.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { TenantSettings } from "../../lib/tenant-context/readers.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import type { BrandingImageSlot } from "../branding/schemas.ts";
import type { FileStorage } from "../file-storage/index.ts";

/** The Ops Center favicon, a static file of the app's `public/brand/` folder (DR-03). */
export const DEFAULT_FAVICON_URL = "/brand/favicon.ico";

/** Catalogue copy for core's own admin entries and groups (R-41); module copy stays declared. */
export type ShellLabels = {
  readonly coreEntries: Readonly<Record<string, string>>;
  readonly coreGroups: Readonly<Record<CoreAdminGroupId, string>>;
};

export type ShellModel = {
  readonly navigation: ShellNavigation;
  readonly landing: string | undefined;
  readonly workspaceHome: string | undefined;
  readonly isAdministrator: boolean;
  readonly adminHome: string | undefined;
  readonly identity: ShellIdentity;
  readonly support: SupportContact | null;
  readonly changePasswordUrl: string | null;
};

const coreGroupIds = new Set<string>(
  CORE_ADMIN_NAVIGATION.map((group) => group.id)
);

const isCoreGroup = (id: string): id is CoreAdminGroupId =>
  coreGroupIds.has(id);

/** The tree as browser links: `{ id, label, href }` only, so no permission key leaves the server. */
export function shellNavigation(
  tree: NavigationTree,
  modules: readonly Module[],
  labels: ShellLabels
): ShellNavigation {
  const link = (entry: PermittedEntry): ShellLink => ({
    id: entry.id,
    label:
      (entry.moduleId === CORE_NAVIGATION_ID
        ? labels.coreEntries[entry.id]
        : undefined) ?? entry.label,
    href: entry.path,
  });

  return {
    pinned: tree.pinned.map(link),
    workspace: tree.workspace.map(link),
    categories: tree.categories.map((category) => ({
      id: category.id,
      name: category.name,
      entries: category.entries.map(link),
    })),
    admin: tree.admin.map((group) => ({
      id: group.id,
      label: isCoreGroup(group.id)
        ? labels.coreGroups[group.id]
        : (modules.find((module) => module.identity.id === group.id)?.identity
            .displayName ?? group.id),
      entries: group.entries.map(link),
    })),
  };
}

/**
 * The chrome switch (R-32, DEC-23). The core admin entries cover all six core keys, so holding a
 * core admin group in the already permitted tree equals holding a core admin permission.
 */
export function administration(
  tree: NavigationTree
): Pick<ShellModel, "isAdministrator" | "adminHome"> {
  const first = tree.admin.find((group) => isCoreGroup(group.id));

  return {
    isAdministrator: first !== undefined,
    adminHome: first?.entries[0]?.path,
  };
}

/**
 * Where home sends a person when no landing route resolves (R-34): the first workspace entry in the
 * navigation rail's order, the same rule as `adminHome`. Undefined means no grants.
 */
export function workspaceHome(tree: NavigationTree): string | undefined {
  return [
    ...tree.workspace,
    ...tree.pinned,
    ...tree.categories.flatMap((category) => category.entries),
  ][0]?.path;
}

type RealmPageInput = {
  readonly settings: Pick<
    TenantSettings,
    "localAccountsEnabled" | "realmSupportsLocalAccounts" | "keycloakUrlAtSetup"
  >;
  readonly publicUrl: string;
  readonly realm: string | undefined;
};

/** A page of the tenant realm, linked only while the realm supports local accounts and `open` holds. */
function localRealmPage(
  input: RealmPageInput,
  path: string,
  open: boolean
): string | null {
  const { settings } = input;

  return open && settings.realmSupportsLocalAccounts
    ? `${settings.keycloakUrlAtSetup ?? input.publicUrl}/realms/${input.realm ?? "genie"}/${path}`
    : null;
}

/** The realm's own account page, which only a local-account tenant links (Spec 2 R-18). */
export function realmAccountUrl(input: RealmPageInput): string | null {
  return localRealmPage(input, "account", input.settings.localAccountsEnabled);
}

/**
 * The realm's reset-password page, the sign-in page's "Forgot your password?" link. It stays after
 * the setting is turned off while any local account exists (Spec 2 R-51a).
 */
export function realmResetCredentialsUrl(
  input: RealmPageInput & { readonly localAccountExists: boolean }
): string | null {
  return localRealmPage(
    input,
    "login-actions/reset-credentials",
    input.settings.localAccountsEnabled || input.localAccountExists
  );
}

/**
 * Whether the sign-in page offers "Sign in with email and password" beside "Sign in with SSO"
 * (Spec 2 R-17c): a managed, brokered realm that the local-accounts command opened (R-58a). The
 * administrator's switch is not read, so local people keep their entry after it goes off (R-51a).
 */
export function localAccountsBesideSso(
  settings: Pick<
    TenantSettings,
    "realmMode" | "realmSupportsLocalAccounts" | "ssoEmailDomains"
  >
): boolean {
  return (
    settings.realmMode === "managed" &&
    settings.realmSupportsLocalAccounts &&
    settings.ssoEmailDomains.length > 0
  );
}

/**
 * Whether any person other than the break-glass account holds a local password account (Spec 2
 * R-51a). Better Auth's provider id for an email and password account is `credential` (D2-5).
 */
export async function localAccountExists(
  tenant: Pick<TenantContext, "db">
): Promise<boolean> {
  const { rows } = await tenant.db.$client.query<{ readonly found: boolean }>(
    `select exists(select 1 from account a join "user" u on u.id = a.user_id
                    where a.provider_id = 'credential' and not u.is_break_glass) as found`
  );

  return rows[0]?.found === true;
}

/**
 * The tab icon of one document: the published favicon through the branding link, else the Ops
 * Center default. A signed-out page gets no branding link, so it shows the default (R-54 defers a
 * branded favicon on the sign-in page).
 */
export async function faviconHref(
  fileStorage: Pick<FileStorage, "createBrandingMarkLink">,
  caller: RequestPrincipal
): Promise<string> {
  const link = await fileStorage.createBrandingMarkLink({
    principal: caller,
    slot: "favicon",
  });

  return link?.url ?? DEFAULT_FAVICON_URL;
}

/** One request's shell: one navigation tree pass (R-30) plus the branding and settings readers. */
export async function loadShell(input: {
  readonly tenant: TenantContext;
  readonly modules: readonly Module[];
  readonly caller: RequestPrincipal;
  readonly labels: ShellLabels;
}): Promise<ShellModel> {
  const { tenant, modules, caller } = input;

  const link = async (slot: BrandingImageSlot) =>
    (
      await tenant.fileStorage.createBrandingMarkLink({
        principal: caller,
        slot,
      })
    )?.url ?? null;

  const [tree, branding, settings, logoLightUrl, logoDarkUrl, markUrl] =
    await Promise.all([
      navigationTree({ tenant, modules, caller }),
      tenant.branding.get(),
      tenant.settings.get(),
      link("logoLight"),
      link("logoDark"),
      link("logoMark"),
    ]);

  return {
    navigation: shellNavigation(tree, modules, input.labels),
    landing: tree.landing,
    workspaceHome: workspaceHome(tree),
    ...administration(tree),
    identity: {
      companyName: branding.companyName,
      productName: branding.productName,
      logoLightUrl,
      logoDarkUrl,
      markUrl,
    },
    support: supportContact(branding),
    changePasswordUrl: realmAccountUrl({
      settings,
      publicUrl: tenant.env.publicUrl,
      realm: tenant.env.auth?.keycloakRealm,
    }),
  };
}

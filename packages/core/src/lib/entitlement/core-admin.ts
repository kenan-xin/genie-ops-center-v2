import type { PermissionKey } from "../module-contract/keys.ts";
import type { NavigationEntry } from "../module-contract/module.ts";

export type CoreAdminGroupId = "people-and-access" | "tenant" | "catalog";

/**
 * Core's own admin pages (D3-6), grouped as the admin block shows them. They pass the same `can()`
 * filter as module entries in `permittedNavigation`, and no entitlement gates them.
 */
const CORE_ADMIN_GROUPS = [
  {
    id: "people-and-access",
    entries: [
      {
        id: "core-people",
        label: "People",
        path: "/admin/people",
        surface: "admin",
        requiredPermission: "core:people:manage",
      },
      {
        id: "core-groups",
        label: "Groups",
        path: "/admin/groups",
        surface: "admin",
        requiredPermission: "core:groups:manage",
      },
      {
        id: "core-roles",
        label: "Roles",
        path: "/admin/roles",
        surface: "admin",
        requiredPermission: "core:roles:manage",
      },
    ],
  },
  {
    id: "tenant",
    entries: [
      {
        id: "core-branding",
        label: "Branding",
        path: "/admin/branding",
        surface: "admin",
        requiredPermission: "core:branding:manage",
      },
      {
        id: "core-settings",
        label: "Settings",
        path: "/admin/settings",
        surface: "admin",
        requiredPermission: "core:settings:manage",
      },
      {
        id: "core-audit",
        label: "Audit log",
        path: "/admin/audit",
        surface: "admin",
        requiredPermission: "core:audit:read",
      },
    ],
  },
  {
    id: "catalog",
    entries: [
      {
        id: "core-modules",
        label: "Modules",
        path: "/admin/modules",
        surface: "admin",
        requiredPermission: "core:settings:manage",
      },
      {
        id: "core-categories",
        label: "Categories",
        path: "/admin/categories",
        surface: "admin",
        requiredPermission: "core:settings:manage",
      },
    ],
  },
] as const satisfies readonly {
  readonly id: CoreAdminGroupId;
  readonly entries: readonly NavigationEntry[];
}[];

export const CORE_ADMIN_NAVIGATION: readonly {
  readonly id: CoreAdminGroupId;
  readonly entries: readonly NavigationEntry[];
}[] = CORE_ADMIN_GROUPS;

export type CoreAdminEntryId =
  (typeof CORE_ADMIN_GROUPS)[number]["entries"][number]["id"];

/**
 * The permission a core admin page opens behind, read from the table above so that the page and
 * its navigation entry cannot disagree (ARCH-2). An unknown id fails the compile.
 */
export function coreAdminPermission(id: CoreAdminEntryId): PermissionKey {
  const entry = CORE_ADMIN_NAVIGATION.flatMap((group) => group.entries).find(
    (candidate) => candidate.id === id
  );

  if (entry === undefined) throw new Error(`No core admin entry ${id}`);

  return entry.requiredPermission;
}

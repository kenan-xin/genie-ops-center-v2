import type { NavigationEntry } from "../module-contract/module.ts";

export type CoreAdminGroupId = "people-and-access" | "tenant" | "catalog";

/**
 * Core's own admin pages (D3-6), grouped as the admin block shows them. They pass the same `can()`
 * filter as module entries in `permittedNavigation`, and no entitlement gates them.
 */
export const CORE_ADMIN_NAVIGATION: readonly {
  readonly id: CoreAdminGroupId;
  readonly entries: readonly NavigationEntry[];
}[] = [
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
];

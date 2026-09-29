import type { Role, RoleDetail, RolesViewer } from "../types.ts";

export const FIXTURE_VIEWER: RolesViewer = { id: "u-admin", timeZone: "UTC" };

export const FIXTURE_SYSTEM_ROLE: Role = {
  id: "r-tenant-admin",
  name: "Tenant administrator",
  description: "Full administration of this tenant",
  kind: "system",
  moduleId: "core",
  permissions: ["core:groups:manage", "core:roles:manage", "fixture:admin"],
  assignmentCount: 2,
  entitlementAdded: ["fixture:admin"],
  unavailableKeys: [],
};

export const FIXTURE_CUSTOM_ROLE: Role = {
  id: "r-invoice",
  name: "Invoice approver",
  description: "Approves invoices",
  kind: "custom",
  moduleId: null,
  permissions: ["fixture:use", "retired:key"],
  assignmentCount: 1,
  entitlementAdded: [],
  unavailableKeys: ["retired:key"],
};

export const FIXTURE_ROLES: readonly Role[] = [
  FIXTURE_SYSTEM_ROLE,
  FIXTURE_CUSTOM_ROLE,
];

export const FIXTURE_SYSTEM_DETAIL: RoleDetail = {
  ...FIXTURE_SYSTEM_ROLE,
  permissionGroups: [
    {
      moduleId: "core",
      moduleName: "Core",
      entitled: true,
      keys: [
        {
          key: "core:groups:manage",
          label: "core:groups:manage",
          unavailable: false,
        },
        {
          key: "core:roles:manage",
          label: "core:roles:manage",
          unavailable: false,
        },
      ],
    },
    {
      moduleId: "fixture",
      moduleName: "Fixture",
      entitled: true,
      keys: [
        {
          key: "fixture:admin",
          label: "Administer the fixture",
          unavailable: false,
        },
      ],
    },
  ],
  assignments: [
    {
      id: "a-1",
      principalType: "user",
      principalId: "p-1",
      principalLabel: "Ada Lovelace",
      scopeType: null,
      scopeId: null,
    },
    {
      id: "a-2",
      principalType: "group",
      principalId: "g-1",
      principalLabel: "Finance managers",
      scopeType: null,
      scopeId: null,
    },
  ],
};

export const FIXTURE_CUSTOM_DETAIL: RoleDetail = {
  ...FIXTURE_CUSTOM_ROLE,
  permissionGroups: [
    {
      moduleId: "fixture",
      moduleName: "Fixture",
      entitled: true,
      keys: [
        { key: "fixture:use", label: "Use the fixture", unavailable: false },
      ],
    },
    {
      moduleId: "retired",
      moduleName: "retired",
      entitled: false,
      keys: [{ key: "retired:key", label: "retired:key", unavailable: true }],
    },
  ],
  assignments: [
    {
      id: "a-3",
      principalType: "group",
      principalId: "g-2",
      principalLabel: "Operations",
      scopeType: null,
      scopeId: null,
    },
  ],
};

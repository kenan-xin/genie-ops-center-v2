import type {
  Role,
  RoleDetail,
  RolePermissionGroup,
  RolesViewer,
} from "../types.ts";

export const FIXTURE_VIEWER: RolesViewer = { id: "u-admin", timeZone: "UTC" };

/** The declared catalogue the role form picks from: core keys plus one module's keys (R-33). */
export const FIXTURE_CATALOGUE: readonly RolePermissionGroup[] = [
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
      { key: "fixture:use", label: "Use the fixture", unavailable: false },
      {
        key: "fixture:admin",
        label: "Administer the fixture",
        unavailable: false,
      },
    ],
  },
];

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

/** A custom role carrying two unavailable keys, to prove one can be removed while the other stays. */
export const FIXTURE_TWO_UNAVAILABLE_DETAIL: RoleDetail = {
  id: "r-two-retired",
  name: "Two retired keys",
  description: "",
  kind: "custom",
  moduleId: null,
  permissions: ["fixture:use", "retired:one", "retired:two"],
  assignmentCount: 0,
  entitlementAdded: [],
  unavailableKeys: ["retired:one", "retired:two"],
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
      keys: [
        { key: "retired:one", label: "retired:one", unavailable: true },
        { key: "retired:two", label: "retired:two", unavailable: true },
      ],
    },
  ],
  assignments: [],
};

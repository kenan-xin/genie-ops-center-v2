import type {
  Role,
  RoleDetail,
  RoleHolders,
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
  unavailableKeys: [{ key: "retired:key", reason: "retired" }],
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
  unavailableKeys: [
    { key: "retired:one", reason: "retired" },
    { key: "retired:two", reason: "retired" },
  ],
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
        {
          key: "retired:one",
          label: "retired:one",
          unavailable: true,
          unavailableReason: "retired",
        },
        {
          key: "retired:two",
          label: "retired:two",
          unavailable: true,
          unavailableReason: "retired",
        },
      ],
    },
  ],
};

/**
 * A custom role holding a key of a module that is now switched off: the key is unavailable with
 * the "module disabled" reason, kept until an administrator removes it (R-33b).
 */
export const FIXTURE_DISABLED_MODULE_DETAIL: RoleDetail = {
  id: "r-dormant",
  name: "Dormant module role",
  description: "",
  kind: "custom",
  moduleId: null,
  permissions: ["fixture:use", "dormant:use"],
  assignmentCount: 1,
  entitlementAdded: [],
  unavailableKeys: [{ key: "dormant:use", reason: "module-disabled" }],
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
      moduleId: "dormant",
      moduleName: "Dormant",
      entitled: false,
      keys: [
        {
          key: "dormant:use",
          label: "Use the dormant module",
          unavailable: true,
          unavailableReason: "module-disabled",
        },
      ],
    },
  ],
};

type Holder = RoleHolders["paths"][number]["holder"];

/** One whole-tenant path of `FIXTURE_CUSTOM_DETAIL`, as the effective-access read returns it. */
const holderPath = (holder: Holder): RoleHolders["paths"][number] => ({
  assignmentId: `a-${holder.id}`,
  holder,
  role: {
    id: FIXTURE_CUSTOM_DETAIL.id,
    name: FIXTURE_CUSTOM_DETAIL.name,
    kind: FIXTURE_CUSTOM_DETAIL.kind,
    moduleId: FIXTURE_CUSTOM_DETAIL.moduleId,
    permissions: FIXTURE_CUSTOM_DETAIL.permissions,
  },
  scope: null,
  addedBy: null,
  addedAt: "2026-11-01T09:00:00.000000Z",
  notInEffect: [],
});

const HOLDER_GROUPS = [
  { id: "g-ops", name: "Operations", memberCount: 40 },
  { id: "g-solo", name: "Dry run", memberCount: 1 },
  { id: "g-finance", name: "Finance team", memberCount: 12 },
] as const;

const holders = (people: readonly Holder[], groups: readonly Holder[]) => ({
  // Read order is newest first, so a group can come after the people.
  paths: [...people, ...groups].map(holderPath),
  total: people.length + groups.length,
  recipients: { groups: HOLDER_GROUPS, people: [] },
});

const person = (id: string, name: string): Holder => ({
  type: "user",
  id,
  name,
});

const group = (index: number): Holder => ({
  type: "group",
  id: HOLDER_GROUPS[index]!.id,
  name: HOLDER_GROUPS[index]!.name,
});

export const HOLDERS_NONE: RoleHolders = holders([], []);

/** One group and two people, the people in read order Zoe then Ada. */
export const HOLDERS_THREE: RoleHolders = holders(
  [person("p-zoe", "Zoe Brandt"), person("p-ada", "Ada Lovelace")],
  [group(1)]
);

/** Ten people, then two groups in read order: past ten, the groups still come first. */
export const HOLDERS_TWELVE: RoleHolders = holders(
  Array.from({ length: 10 }, (_, index) =>
    person(`p-${index}`, `Person ${String(index + 1).padStart(2, "0")}`)
  ),
  [group(0), group(2)]
);

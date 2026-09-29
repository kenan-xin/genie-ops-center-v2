import type {
  AssignableRole,
  Group,
  GroupAssignment,
  GroupMember,
  GroupsViewer,
  PersonOption,
} from "../types.ts";

export const FIXTURE_VIEWER: GroupsViewer = {
  id: "u-admin",
  timeZone: "UTC",
};

export const FIXTURE_ROLES: readonly AssignableRole[] = [
  { id: "r-1", name: "Tenant administrator", moduleId: "core" },
  { id: "r-2", name: "Auditor", moduleId: "core" },
  { id: "r-3", name: "Invoice approver", moduleId: null },
];

export const FIXTURE_PEOPLE: readonly PersonOption[] = [
  { id: "p-1", name: "Ada Lovelace", email: "ada@example.invalid" },
  { id: "p-2", name: "Grace Hopper", email: "grace@example.invalid" },
];

/** A directory group with a readable label over an object-id value (R-24c). */
export const FIXTURE_DIRECTORY: Group = {
  id: "g-directory",
  name: "0a1b2c3d-ob-id",
  description: "",
  source: "idp",
  externalId: "0a1b2c3d-ob-id",
  displayLabel: "Finance managers",
  memberCount: 2,
  assignmentCount: 3,
  lastSeenAt: "2026-09-01T10:00:00.000Z",
  archived: false,
  stale: false,
};

/** A directory group no sign-in has listed yet: "Not seen yet", deletable (R-24b). */
export const FIXTURE_NOT_SEEN: Group = {
  id: "g-not-seen",
  name: "Sales",
  description: "",
  source: "idp",
  externalId: "Sales",
  displayLabel: null,
  memberCount: 0,
  assignmentCount: 1,
  lastSeenAt: null,
  archived: false,
  stale: false,
};

/** A directory group the provider stopped sending (R-24a). */
export const FIXTURE_STALE: Group = {
  id: "g-stale",
  name: "Contractors",
  description: "",
  source: "idp",
  externalId: "Contractors",
  displayLabel: null,
  memberCount: 1,
  assignmentCount: 0,
  lastSeenAt: "2026-01-01T10:00:00.000Z",
  archived: false,
  stale: true,
};

export const FIXTURE_LOCAL: Group = {
  id: "g-local",
  name: "Operations",
  description: "The operations team",
  source: "local",
  externalId: null,
  displayLabel: null,
  memberCount: 2,
  assignmentCount: 1,
  lastSeenAt: null,
  archived: false,
  stale: false,
};

export const FIXTURE_ARCHIVED: Group = {
  id: "g-archived",
  name: "Ex-contractors",
  description: "",
  source: "idp",
  externalId: "Ex-contractors",
  displayLabel: null,
  memberCount: 0,
  assignmentCount: 2,
  lastSeenAt: "2025-06-01T10:00:00.000Z",
  archived: true,
  stale: false,
};

export const FIXTURE_GROUPS: readonly Group[] = [
  FIXTURE_DIRECTORY,
  FIXTURE_NOT_SEEN,
  FIXTURE_STALE,
  FIXTURE_LOCAL,
];

export const FIXTURE_MEMBERS: readonly GroupMember[] = [
  {
    id: "p-1",
    name: "Ada Lovelace",
    email: "ada@example.invalid",
    source: "idp",
    syncedAt: "2026-09-01T10:00:00.000Z",
  },
  {
    id: "p-2",
    name: "Grace Hopper",
    email: "grace@example.invalid",
    source: "idp",
    syncedAt: "2026-09-01T10:00:00.000Z",
  },
];

export const FIXTURE_ASSIGNMENTS: readonly GroupAssignment[] = [
  {
    id: "a-1",
    roleId: "r-1",
    roleName: "Tenant administrator",
    scopeType: null,
    scopeId: null,
  },
  {
    id: "a-2",
    roleId: "r-2",
    roleName: "Auditor",
    scopeType: null,
    scopeId: null,
  },
  {
    id: "a-3",
    roleId: "r-3",
    roleName: "Invoice approver",
    scopeType: "office",
    scopeId: "office-1",
  },
];

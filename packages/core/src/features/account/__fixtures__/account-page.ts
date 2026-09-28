import type {
  AccountGroup,
  AccountPageProps,
  AccountRoleGrant,
  AccountSession,
} from "../types.ts";

/**
 * Deterministic, synthetic Account page fixtures (R-18): one person, three groups, three
 * sessions - the current one first - and two role grants, one direct and one through a group.
 * Nothing here names a real tenant, person, or address; the addresses are documentation
 * examples by design (RFC 5737).
 */

export const FIXTURE_NOW = "2026-09-28T12:00:00.000Z";

export const FIXTURE_PROFILE: AccountPageProps["profile"] = {
  name: "Priya Nair",
  email: "priya.nair@example.com",
};

export const FIXTURE_GROUPS: readonly AccountGroup[] = [
  { id: "g-1", name: "Directory admins", source: "idp" },
  { id: "g-2", name: "Field engineers", source: "idp" },
  { id: "g-3", name: "Contract reviewers", source: "local" },
];

export const FIXTURE_SESSIONS: readonly AccountSession[] = [
  {
    id: "s-current",
    device: "Windows",
    browser: "Chrome",
    ipAddress: "192.0.2.10",
    signedInAt: "2026-09-28T09:41:00.000Z",
    lastActiveAt: "2026-09-28T11:58:00.000Z",
    isCurrent: true,
  },
  {
    id: "s-phone",
    device: "Pixel 7 (Android)",
    browser: "Chrome",
    ipAddress: "192.0.2.44",
    signedInAt: "2026-09-27T16:05:00.000Z",
    lastActiveAt: "2026-09-27T16:44:00.000Z",
    isCurrent: false,
  },
  {
    id: "s-tablet",
    device: "iPad",
    browser: "Safari",
    ipAddress: "198.51.100.7",
    signedInAt: "2026-09-26T08:12:00.000Z",
    lastActiveAt: "2026-09-26T08:12:00.000Z",
    isCurrent: false,
  },
];

export const FIXTURE_ROLE_GRANTS: readonly AccountRoleGrant[] = [
  {
    roleName: "Solutions editor",
    moduleName: "solutions",
    permissionCount: 2,
    scopeLabel: "Whole tenant",
    via: null,
  },
  {
    roleName: "Contract viewer",
    moduleName: "contracts",
    permissionCount: 3,
    scopeLabel: "Vendor agreements",
    via: "Field engineers",
  },
];

export const FIXTURE_ACCOUNT_PAGE: Omit<AccountPageProps, "nowIso"> = {
  profile: FIXTURE_PROFILE,
  groups: FIXTURE_GROUPS,
  sessions: FIXTURE_SESSIONS,
  roleGrants: FIXTURE_ROLE_GRANTS,
  accountManagementUrl: null,
  timeZone: "UTC",
};

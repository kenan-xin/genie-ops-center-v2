import type { GrantRow } from "../../../services/roles/grants.ts";
import { FIXTURE_ROWS } from "../../access/__fixtures__/access.ts";
import type {
  PeopleSettings,
  PeopleViewer,
  Person,
  PersonDetail,
} from "../types.ts";

/**
 * Deterministic synthetic fixtures for the People stories. They are clearly synthetic (no real
 * tenant data) and carry every status the directory renders: active, pending local, pending
 * brokered and disabled.
 */

export const FIXTURE_VIEWER: PeopleViewer = {
  id: "u-viewer",
  timeZone: "Europe/Amsterdam",
  nowIso: "2026-09-30T09:12:00.000Z",
};

export const FIXTURE_SETTINGS: PeopleSettings = {
  onboardingMode: "invite",
  localAccountsEnabled: true,
};

export const FIXTURE_JIT_SETTINGS: PeopleSettings = {
  onboardingMode: "jit",
  localAccountsEnabled: false,
};

const ASK_ROW = FIXTURE_ROWS.filter((row) => row.group === "core");

/**
 * The twelve modules of the prototype's long list (`add-person.prototype.html`, `MANY`), in its
 * order, with Travel and Fleet switched off, then Ask. Each module has six roles, its user role the
 * default and first, as the Grants catalogue orders them.
 */
export const FIXTURE_MANY_ROWS: readonly GrantRow[] = [
  ...(
    [
      ["Contracts", "Agreements, renewals and obligations"],
      ["Approvals", "Requests that need a sign-off"],
      ["Procurement", "Purchase requests and orders"],
      ["Assets", "Equipment and who holds it"],
      ["Timesheets", "Hours worked per project"],
      ["Travel", "Trips, bookings and claims"],
      ["Learning", "Courses and certificates"],
      ["Helpdesk", "Tickets from staff"],
      ["Inventory", "Stock levels per site"],
      ["Fleet", "Vehicles and their bookings"],
      ["Recruiting", "Openings and candidates"],
      ["Payroll", "Pay runs and payslips"],
    ] as const
  ).map(([name, description]): GrantRow => {
    const id = name.toLowerCase();

    return {
      id,
      name,
      description,
      group: "modules",
      enabled: name !== "Travel" && name !== "Fleet",
      useKey: `${id}:use`,
      roles: [
        "user",
        "viewer",
        "editor",
        "approver",
        "manager",
        "administrator",
      ].map((level) => ({
        id: `r-${id}-${level}`,
        name: `${name} ${level}`,
        kind: "system",
      })),
      defaultRoleId: `r-${id}-user`,
    };
  }),
  ...ASK_ROW,
];

/** The first six switched-on modules of the long list, then Ask: one short of the finder. */
export const FIXTURE_SIX_ROWS: readonly GrantRow[] = [
  ...FIXTURE_MANY_ROWS.filter(
    (row) => row.group === "modules" && row.enabled
  ).slice(0, 6),
  ...ASK_ROW,
];

export const FIXTURE_PEOPLE: readonly Person[] = [
  {
    id: "u-viewer",
    name: "Ada Admin",
    email: "ada@example.com",
    status: "active",
    accountType: "brokered",
    identitySource: "External identity provider",
    groups: [{ id: "g-admins", label: "Genie Administrators" }],
    roleCount: 1,
    firstSignInAt: "2026-01-04T09:00:00.000Z",
    lastSignInAt: "2026-09-30T08:12:00.000Z",
    onboarding: "invited",
    setPasswordSentAt: null,
    invitationSentAt: null,
  },
  {
    id: "u-leo",
    name: "Leo Local",
    email: "leo@example.com",
    status: "pending",
    accountType: "local",
    identitySource: "Genie (local password)",
    groups: [],
    roleCount: 0,
    firstSignInAt: null,
    lastSignInAt: null,
    onboarding: "invited",
    setPasswordSentAt: "2026-09-29T12:00:00.000Z",
    invitationSentAt: null,
  },
  {
    id: "u-bea",
    name: "Bea Brokered",
    email: "bea@example.com",
    status: "pending",
    accountType: "brokered",
    identitySource: "External identity provider",
    groups: [{ id: "g-sales", label: "Sales" }],
    roleCount: 1,
    firstSignInAt: null,
    lastSignInAt: null,
    onboarding: "invited",
    setPasswordSentAt: null,
    invitationSentAt: "2026-09-28T10:30:00.000Z",
  },
  {
    id: "u-dan",
    name: "Dan Disabled",
    email: "dan@example.com",
    status: "disabled",
    accountType: "brokered",
    identitySource: "External identity provider",
    groups: [],
    roleCount: 0,
    firstSignInAt: "2026-02-01T09:00:00.000Z",
    lastSignInAt: "2026-05-01T09:00:00.000Z",
    onboarding: "invited",
    setPasswordSentAt: null,
    invitationSentAt: null,
  },
];

export const FIXTURE_DETAILS = {
  "u-viewer": {
    ...FIXTURE_PEOPLE[0]!,
    groups: [
      {
        id: "g-admins",
        name: "Genie Administrators",
        label: "Genie Administrators",
        source: "local",
        syncedAt: null,
      },
    ],
    assignments: [
      {
        id: "a-1",
        roleId: "r-admin",
        roleName: "Tenant administrator",
        moduleId: "core",
        scopeType: null,
        scopeId: null,
        source: "group",
        groupId: "g-admins",
        groupName: "Genie Administrators",
      },
    ],
    sessions: [
      {
        id: "s-1",
        device: "Windows",
        browser: "Chrome",
        ipAddress: "203.0.113.7",
        signedInAt: "2026-09-30T08:12:00.000Z",
        lastActiveAt: "2026-09-30T08:40:00.000Z",
      },
    ],
  },
  "u-leo": {
    ...FIXTURE_PEOPLE[1]!,
    groups: [],
    assignments: [],
    sessions: [],
  },
  "u-bea": {
    ...FIXTURE_PEOPLE[2]!,
    groups: [
      {
        id: "g-sales",
        name: "Sales",
        label: "Sales",
        source: "idp",
        syncedAt: "2026-09-28T10:30:00.000Z",
      },
    ],
    assignments: [
      {
        id: "a-2",
        roleId: "r-reader",
        roleName: "E2E reader",
        moduleId: "e2e",
        scopeType: null,
        scopeId: null,
        source: "direct",
        groupId: null,
        groupName: null,
      },
    ],
    sessions: [],
  },
  "u-dan": {
    ...FIXTURE_PEOPLE[3]!,
    groups: [],
    assignments: [],
    sessions: [],
  },
} satisfies Record<string, PersonDetail>;

/** The one active administrator, for the last-administrator and self-protection stories. */
export const FIXTURE_SOLE_ADMIN_PERSON_ID = "u-viewer";

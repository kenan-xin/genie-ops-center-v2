import type {
  AdvancedCatalogue,
  AdvancedOption,
} from "../../../services/roles/advanced.ts";
import type { AccessPath } from "../../../services/roles/effective-access.ts";
import type {
  GrantRecipients,
  GrantRow,
} from "../../../services/roles/grants.ts";
import type { RoleRow } from "../../../services/roles/index.ts";

/**
 * The prototype's sample tenant, Harbor Point (`docs/design/sections/access/access.prototype.html`):
 * the four built modules with their owner defaults, Ask, and Analytics switched off. Invoices also
 * holds one custom role, which the role choice lists after the declared roles (P3).
 */
export const FIXTURE_ROWS: readonly GrantRow[] = [
  {
    id: "analytics",
    name: "Analytics",
    description: "Dashboards and saved questions",
    group: "modules",
    enabled: false,
    useKey: "analytics:use",
    roles: [
      { id: "r-analytics-editor", name: "Analytics editor", kind: "system" },
      { id: "r-analytics-viewer", name: "Analytics viewer", kind: "system" },
    ],
    defaultRoleId: "r-analytics-editor",
  },
  {
    id: "invoices",
    name: "Invoices",
    description: "Invoices, payments and the review inbox",
    group: "modules",
    enabled: true,
    useKey: "invoices:use",
    roles: [
      { id: "r-invoices-viewer", name: "Viewer", kind: "system" },
      {
        id: "r-invoices-user",
        name: "Invoices and Payments user",
        kind: "system",
      },
      { id: "r-invoices-finance", name: "Finance", kind: "system" },
      { id: "r-invoices-auditor", name: "Invoice auditor", kind: "custom" },
    ],
    defaultRoleId: "r-invoices-viewer",
  },
  {
    id: "placeholder",
    name: "Placeholder",
    description: "Reference module for new capabilities",
    group: "modules",
    enabled: true,
    useKey: "placeholder:use",
    roles: [
      { id: "r-placeholder-user", name: "Placeholder user", kind: "system" },
    ],
    defaultRoleId: "r-placeholder-user",
  },
  {
    id: "slides",
    name: "Slides",
    description: "Decks built from your data",
    group: "modules",
    enabled: true,
    useKey: "slides:use",
    roles: [{ id: "r-slides-editor", name: "Slides editor", kind: "system" }],
    defaultRoleId: "r-slides-editor",
  },
  {
    id: "core:ask",
    name: "Ask",
    description: "The agent chat on every page.",
    group: "core",
    enabled: true,
    useKey: "core:ask:use",
    roles: [{ id: "r-ask-user", name: "Ask user", kind: "system" }],
    defaultRoleId: "r-ask-user",
  },
];

export const fixtureRow = (id: string): GrantRow => {
  const row = FIXTURE_ROWS.find((candidate) => candidate.id === id);

  if (row === undefined) throw new Error(`No fixture row ${id}`);

  return row;
};

/** One path of the S2-19 read, with the fields the Remove confirmation reads. */
export function fixturePath(input: {
  readonly id: string;
  readonly holder: AccessPath["holder"];
  readonly role: { readonly id: string; readonly name: string };
  readonly moduleId: string;
  readonly scope?: AccessPath["scope"];
}): AccessPath {
  return {
    assignmentId: input.id,
    holder: input.holder,
    role: {
      id: input.role.id,
      name: input.role.name,
      kind: "system",
      moduleId: input.moduleId,
      permissions: [`${input.moduleId}:use`],
    },
    scope: input.scope ?? null,
    addedBy: { id: "p-alex", name: "Alex Morgan" },
    addedAt: "2026-11-01T09:00:00.000000Z",
    notInEffect: [],
  };
}

const holder = {
  ops: { type: "group", id: "g-ops", name: "Operations" },
  finance: { type: "group", id: "g-finance", name: "Finance team" },
  sales: { type: "group", id: "g-sales", name: "Sales desk" },
  jamie: { type: "user", id: "p-jamie", name: "Jamie Chen" },
  sam: { type: "user", id: "p-sam", name: "Sam Rivera" },
  admins: { type: "group", id: "g-admins", name: "Genie Administrators" },
  riley: { type: "user", id: "p-riley", name: "Riley Park" },
} as const;

const role = (id: string) => {
  const found = FIXTURE_ROWS.flatMap((row) =>
    row.roles.map((candidate) => ({ row: row.id, role: candidate }))
  ).find((entry) => entry.role.id === id);

  if (found === undefined) throw new Error(`No fixture role ${id}`);

  return { role: found.role, moduleId: found.row };
};

const held = (id: string, by: AccessPath["holder"], roleId: string) =>
  fixturePath({ id, holder: by, ...role(roleId) });

const financeInvoices = held("a-fin-1", holder.finance, "r-invoices-finance");

const financeAnalytics = held("a-fin-2", holder.finance, "r-analytics-viewer");

/** Tenant administrator, which includes Ask (core:ask:use). */
const tenantAdminOf = (id: string, by: AccessPath["holder"]): AccessPath => ({
  ...fixturePath({
    id,
    holder: by,
    role: { id: "r-tenant-admin", name: "Tenant administrator" },
    moduleId: "core",
  }),
  role: {
    id: "r-tenant-admin",
    name: "Tenant administrator",
    kind: "system",
    moduleId: null,
    permissions: ["core:ask:use", "core:roles:manage"],
  },
});

const leadership = {
  type: "group",
  id: "g-leads",
  name: "Leadership",
} as const;

/**
 * The direct roles that Advanced access lists, as the prototype's `advanced` and `advanced-guard`
 * states draw them: Operations holds Finance at one invoice and the custom Invoice approver, and
 * Leadership holds the only Tenant administrator path.
 */
export const ADVANCED_PATHS = {
  "g-ops": [
    {
      ...held("a-ops-record", holder.ops, "r-invoices-finance"),
      scope: { type: "invoices-invoice", id: "inv-0142" },
    },
    {
      ...held("a-ops-approver", holder.ops, "r-invoices-viewer"),
      role: {
        id: "r-invoice-approver",
        name: "Invoice approver",
        kind: "custom",
        moduleId: "invoices",
        permissions: ["invoices:use", "invoices:approve"],
      },
    },
  ],
  "g-leads": [
    {
      ...fixturePath({
        id: "a-leads-admin",
        holder: leadership,
        role: { id: "r-tenant-admin", name: "Tenant administrator" },
        moduleId: "core",
      }),
      role: {
        id: "r-tenant-admin",
        name: "Tenant administrator",
        kind: "system",
        moduleId: null,
        permissions: ["core:roles:manage"],
      },
    },
  ],
} satisfies Record<string, readonly AccessPath[]>;

/** The record labels the labels read answers for the scoped fixture rows. */
export const ADVANCED_LABELS: ReadonlyMap<string, string> = new Map([
  ["invoices-invoice\u0000inv-0142", "INV-2026-0142"],
]);

const option = (
  fields: Pick<AdvancedOption, "roleId" | "roleName" | "moduleName"> &
    Partial<AdvancedOption>
): AdvancedOption => ({
  kind: "system",
  moduleId: null,
  enabled: true,
  wholeTenant: true,
  recordType: null,
  ...fields,
});

/** The Add a role picker of the prototype: Core, one record module, and three custom roles. */
export const ADVANCED_CATALOGUE: AdvancedCatalogue = {
  core: [
    option({
      roleId: "r-tenant-admin",
      roleName: "Tenant administrator",
      moduleName: "Core administration",
    }),
    option({
      roleId: "r-auditor",
      roleName: "Auditor",
      moduleName: "Core administration",
    }),
  ],
  record: [
    option({
      roleId: "r-placeholder-user",
      roleName: "Placeholder user",
      moduleId: "placeholder",
      moduleName: "Placeholder",
      wholeTenant: false,
      recordType: "placeholder-record",
    }),
  ],
  custom: [
    option({
      roleId: "r-access-manager",
      roleName: "Access manager",
      kind: "custom",
      moduleName: "Core administration",
    }),
    option({
      roleId: "r-invoice-approver",
      roleName: "Invoice approver",
      kind: "custom",
      moduleId: "invoices",
      moduleName: "Invoices",
    }),
    option({
      roleId: "r-dashboard-curator",
      roleName: "Dashboard curator",
      kind: "custom",
      moduleId: "analytics",
      moduleName: "Analytics",
      enabled: false,
    }),
  ],
};

/** The Placeholder records the picker search finds, by label. */
export const FIXTURE_RECORDS = [
  { id: "rec-north", label: "North depot" },
  { id: "rec-south", label: "South depot" },
] as const;

export const searchFixtureRecords = async (
  _recordType: string,
  query: string
) =>
  FIXTURE_RECORDS.filter((record) =>
    record.label.toLowerCase().includes(query.toLowerCase())
  );

/**
 * The paths of the S2-19 read for each sample recipient, as the prototype states draw them:
 * Operations (role choice, and two advanced roles), Leadership (the only administrator path), Jamie Chen (a group path stays), Sam Rivera (no path stays),
 * Finance team (Analytics is off), Sales desk (Ask, with Tenant administrator not shown),
 * Genie Administrators (Ask only through Tenant administrator), and Riley Park (Invoices and the
 * switched-off Analytics only through Finance team).
 */
const PATHS = {
  "g-ops": [
    held("a-ops-1", holder.ops, "r-invoices-viewer"),
    held("a-ops-2", holder.ops, "r-slides-editor"),
    held("a-ops-3", holder.ops, "r-ask-user"),
    ...ADVANCED_PATHS["g-ops"],
  ],
  "g-leads": ADVANCED_PATHS["g-leads"],
  "g-finance": [financeInvoices, financeAnalytics],
  "g-sales": [
    held("a-sales-1", holder.sales, "r-ask-user"),
    tenantAdminOf("a-sales-2", holder.sales),
  ],
  "g-admins": [tenantAdminOf("a-admins-1", holder.admins)],
  "p-riley": [
    held("a-riley-1", holder.riley, "r-slides-editor"),
    financeInvoices,
    financeAnalytics,
  ],
  "p-jamie": [
    held("a-jamie-1", holder.jamie, "r-invoices-viewer"),
    financeInvoices,
  ],
  "p-sam": [held("a-sam-1", holder.sam, "r-slides-editor")],
} satisfies Record<string, readonly AccessPath[]>;

export const fixturePaths = (recipientId: string): readonly AccessPath[] =>
  Object.entries(PATHS).find(([id]) => id === recipientId)?.[1] ?? [];

/** The extra Invoices holders of the prototype, so a module lookup pages past ten rows. */
const INVOICE_GROUPS = [
  ["g-ap", "Accounts payable", 9, "r-invoices-finance"],
  ["g-ar", "Accounts receivable", 7, "r-invoices-finance"],
  ["g-treasury", "Treasury", 4, "r-invoices-viewer"],
  ["g-proc", "Procurement", 11, "r-invoices-viewer"],
  ["g-ctrl", "Controllers", 5, "r-invoices-user"],
  ["g-payroll", "Payroll", 6, "r-invoices-viewer"],
  ["g-tax", "Tax desk", 3, "r-invoices-viewer"],
  ["g-audit", "Audit committee", 5, "r-invoices-viewer"],
  ["g-north", "Regional office North", 22, "r-invoices-user"],
  ["g-south", "Regional office South", 18, "r-invoices-user"],
  ["g-credit", "Credit control", 4, "r-invoices-finance"],
  ["g-billing", "Billing support", 10, "r-invoices-user"],
] as const;

const more = {
  former: { type: "group", id: "g-former", name: "Former finance" },
  robin: { type: "user", id: "p-robin", name: "Robin Hale" },
  drew: { type: "user", id: "p-drew", name: "Drew Patel" },
  casey: { type: "user", id: "p-casey", name: "Casey Park" },
} as const;

/** A path of the Overview samples, added on the given day by the given person. */
const sample = (
  id: string,
  by: AccessPath["holder"],
  roleId: string,
  extra: Partial<AccessPath> = {}
): AccessPath => ({ ...held(id, by, roleId), ...extra });

const addedOn = (day: string, name = "Alex Morgan") => ({
  addedAt: `2026-${day}T09:00:00.000000Z`,
  addedBy: { id: name === "Alex Morgan" ? "p-alex" : "p-jordan", name },
});

const auditor: AccessPath = {
  ...sample(
    "o-fin-auditor",
    holder.finance,
    "r-invoices-viewer",
    addedOn("09-12")
  ),
  role: {
    id: "r-auditor",
    name: "Auditor",
    kind: "system",
    moduleId: null,
    permissions: ["core:audit:read"],
  },
};

const FINANCE_INVOICES = sample(
  "o-fin-inv",
  holder.finance,
  "r-invoices-finance",
  addedOn("10-20", "Jordan Lee")
);

const OPS_INVOICES = sample(
  "o-ops-inv",
  holder.ops,
  "r-invoices-viewer",
  addedOn("10-18")
);

const OPS_RECORD = sample("o-ops-rec", holder.ops, "r-invoices-finance", {
  ...addedOn("09-08", "Jordan Lee"),
  // A record shows its uuid until S2-23 brings record labels (O15).
  scope: { type: "invoice", id: "a0774a4a-a630-41ba-8364-bcb715ff0c6a" },
});

const INVOICE_AUDITOR: AccessPath["role"] = {
  id: "r-invoices-auditor",
  name: "Invoice auditor",
  kind: "custom",
  moduleId: "invoices",
  permissions: ["invoices:use", "invoices:read"],
};

const OPS_AUDITOR: AccessPath = {
  ...sample("o-ops-aud", holder.ops, "r-invoices-auditor", addedOn("08-21")),
  role: INVOICE_AUDITOR,
};

const FINANCE_PATHS = [
  FINANCE_INVOICES,
  sample("o-fin-an", holder.finance, "r-analytics-viewer", {
    ...addedOn("10-14"),
    notInEffect: ["module-off"],
  }),
  sample("o-fin-ask", holder.finance, "r-ask-user", addedOn("09-30")),
  auditor,
];

const OPS_PATHS = [
  OPS_INVOICES,
  sample(
    "o-ops-sl",
    holder.ops,
    "r-slides-editor",
    addedOn("10-11", "Jordan Lee")
  ),
  sample("o-ops-ask", holder.ops, "r-ask-user", addedOn("09-25")),
  OPS_RECORD,
  OPS_AUDITOR,
];

const JAMIE_DIRECT = sample(
  "o-jamie-inv",
  holder.jamie,
  "r-invoices-user",
  addedOn("10-01", "Jordan Lee")
);

const INVOICE_PATHS: readonly AccessPath[] = [
  FINANCE_INVOICES,
  OPS_INVOICES,
  JAMIE_DIRECT,
  sample("o-robin-inv", more.robin, "r-invoices-viewer", {
    ...addedOn("10-02"),
    notInEffect: ["person-disabled"],
  }),
  sample("o-drew-inv", more.drew, "r-invoices-finance", addedOn("09-29")),
  ...INVOICE_GROUPS.map(([id, name, , roleId], index) =>
    sample(
      `o-${id}`,
      { type: "group", id, name },
      roleId,
      addedOn(
        `09-${String(27 - index).padStart(2, "0")}`,
        index % 2 === 0 ? "Alex Morgan" : "Jordan Lee"
      )
    )
  ),
  sample("o-former-inv", more.former, "r-invoices-viewer", {
    ...addedOn("08-30"),
    notInEffect: ["group-archived"],
  }),
  OPS_RECORD,
  OPS_AUDITOR,
  {
    ...sample(
      "o-casey-rec",
      more.casey,
      "r-invoices-auditor",
      addedOn("08-12")
    ),
    role: INVOICE_AUDITOR,
    scope: { type: "invoice", id: "INV-2026-0157" },
  },
];

const OVERVIEW_PATHS = {
  "user:p-jamie": [JAMIE_DIRECT, ...FINANCE_PATHS, ...OPS_PATHS],
  "group:g-finance": FINANCE_PATHS,
  "group:g-ops": OPS_PATHS,
  "module:invoices": INVOICE_PATHS,
  "role:r-auditor": [
    { ...auditor, assignmentId: "o-sam-aud", holder: holder.sam },
    auditor,
  ],
} satisfies Record<string, readonly AccessPath[]>;

const roleRow = (
  id: string,
  name: string,
  moduleId: string | null,
  extra: Partial<RoleRow> = {}
): RoleRow => ({
  id,
  name,
  description: "",
  kind: "system",
  moduleId,
  permissions: [],
  assignmentCount: 0,
  entitlementAdded: [],
  unavailableKeys: [],
  ...extra,
});

/** The roles that the Overview's role lookup lists (`d8l5.46`): module roles, then core roles. */
export const FIXTURE_ROLES: readonly RoleRow[] = [
  roleRow("r-invoices-viewer", "Viewer", "invoices"),
  roleRow("r-invoices-auditor", "Invoice auditor", "invoices", {
    kind: "custom",
  }),
  roleRow("r-slides-editor", "Slides editor", "slides"),
  roleRow("r-auditor", "Auditor", null, {
    description: "Reads the audit log",
  }),
  roleRow("r-tenant-admin", "Tenant administrator", null),
];

/**
 * Every path of one Overview subject, from the prototype's sample data: Jamie Chen holds ten
 * (direct, through Finance team and through Operations), and Invoices has 21 holders, among them an
 * archived group and a disabled person. Every other subject holds none.
 */
export const overviewPaths = (subject: {
  readonly type: string;
  readonly id: string;
}): readonly AccessPath[] =>
  Object.entries(OVERVIEW_PATHS).find(
    ([key]) => key === `${subject.type}:${subject.id}`
  )?.[1] ?? [];

/** Two people share the name Alex Morgan, as every seeded e2e person shares one name. */
export const FIXTURE_RECIPIENTS: GrantRecipients = {
  groups: [
    { id: "g-analysts", name: "Analysts", memberCount: 8 },
    { id: "g-finance", name: "Finance team", memberCount: 12 },
    { id: "g-admins", name: "Genie Administrators", memberCount: 2 },
    { id: "g-leads", name: "Leadership", memberCount: 3 },
    { id: "g-ops", name: "Operations", memberCount: 40 },
    { id: "g-pmo", name: "Project office", memberCount: 6 },
    { id: "g-sales", name: "Sales desk", memberCount: 15 },
  ],
  people: [
    { id: "p-alex", name: "Alex Morgan", email: "alex.morgan@example.com" },
    { id: "p-alex-2", name: "Alex Morgan", email: "a.morgan@example.com" },
    { id: "p-casey", name: "Casey Park", email: "casey.park@example.com" },
    { id: "p-jamie", name: "Jamie Chen", email: "jamie.chen@example.com" },
    { id: "p-jordan", name: "Jordan Lee", email: "jordan.lee@example.com" },
    { id: "p-riley", name: "Riley Park", email: "riley.park@example.com" },
    { id: "p-sam", name: "Sam Rivera", email: "sam.rivera@example.com" },
  ],
};

/**
 * The Grants recipients plus the prototype's other groups and people. Former finance is archived,
 * so the recipients read leaves it out (O6). Robin Hale is disabled.
 */
export const OVERVIEW_RECIPIENTS: GrantRecipients = {
  groups: [
    ...FIXTURE_RECIPIENTS.groups,
    ...INVOICE_GROUPS.map(([id, name, memberCount]) => ({
      id,
      name,
      memberCount,
    })),
  ],
  people: [
    ...FIXTURE_RECIPIENTS.people,
    { id: "p-drew", name: "Drew Patel", email: "drew.patel@example.com" },
    { id: "p-morgan", name: "Morgan Ellis", email: "morgan.ellis@example.com" },
    { id: "p-robin", name: "Robin Hale", email: "robin.hale@example.com" },
    {
      id: "p-taylor",
      name: "Taylor Brooks",
      email: "taylor.brooks@example.com",
    },
  ],
};

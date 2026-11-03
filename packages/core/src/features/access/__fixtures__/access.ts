import type { AccessPath } from "../../../services/roles/effective-access.ts";
import type {
  GrantRecipients,
  GrantRow,
} from "../../../services/roles/grants.ts";

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

/**
 * The paths of the S2-19 read for each sample recipient, as the prototype states draw them:
 * Operations (role choice), Jamie Chen (a group path stays), Sam Rivera (no path stays),
 * Finance team (Analytics is off), and Sales desk (Ask, with Tenant administrator not shown).
 */
const PATHS = {
  "g-ops": [
    held("a-ops-1", holder.ops, "r-invoices-viewer"),
    held("a-ops-2", holder.ops, "r-slides-editor"),
    held("a-ops-3", holder.ops, "r-ask-user"),
  ],
  "g-finance": [
    financeInvoices,
    held("a-fin-2", holder.finance, "r-analytics-viewer"),
  ],
  "g-sales": [
    held("a-sales-1", holder.sales, "r-ask-user"),
    {
      ...fixturePath({
        id: "a-sales-2",
        holder: holder.sales,
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
    },
  ],
  "p-jamie": [
    held("a-jamie-1", holder.jamie, "r-invoices-viewer"),
    financeInvoices,
  ],
  "p-sam": [held("a-sam-1", holder.sam, "r-slides-editor")],
} satisfies Record<string, readonly AccessPath[]>;

export const fixturePaths = (recipientId: string): readonly AccessPath[] =>
  Object.entries(PATHS).find(([id]) => id === recipientId)?.[1] ?? [];

/** Two people share the name Alex Morgan, as every seeded e2e person shares one name. */
export const FIXTURE_RECIPIENTS: GrantRecipients = {
  groups: [
    { id: "g-analysts", name: "Analysts", memberCount: 8 },
    { id: "g-finance", name: "Finance team", memberCount: 12 },
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
    { id: "p-sam", name: "Sam Rivera", email: "sam.rivera@example.com" },
  ],
};

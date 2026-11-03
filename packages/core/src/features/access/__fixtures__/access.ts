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

import { expect, it } from "vitest";

import type {
  AdvancedCatalogue,
  AdvancedOption,
} from "../../services/roles/advanced.ts";
import type { AccessPath } from "../../services/roles/effective-access.ts";
import type { GrantRow } from "../../services/roles/grants.ts";
import type { RoleRow } from "../../services/roles/index.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";
import { addedMessage, namesOf, roleChoices } from "./add-assignment-view.ts";

const role = (
  id: string,
  name: string,
  moduleId: string | null,
  kind: "system" | "custom" = "system"
): RoleRow => ({
  id,
  name,
  description: "",
  kind,
  moduleId,
  moduleName: null,
  permissions: [],
  assignmentCount: 0,
  entitlementAdded: [],
  unavailableKeys: [],
});

const grantRow = (
  id: string,
  name: string,
  enabled: boolean,
  roles: GrantRow["roles"],
  defaultRoleId: string | null
): GrantRow => ({
  id,
  name,
  description: null,
  group: "modules",
  enabled,
  useKey: `${id}:use`,
  roles,
  defaultRoleId,
});

const option = (roleId: string, recordType: string | null): AdvancedOption => ({
  roleId,
  roleName: "",
  kind: "system",
  moduleId: null,
  moduleName: "",
  enabled: true,
  wholeTenant: true,
  recordType,
});

const path = (
  holder: AccessPath["holder"],
  roleId: string,
  scope: AccessPath["scope"] = null
): AccessPath => ({
  assignmentId: `${holder.id}-${roleId}`,
  holder,
  role: {
    id: roleId,
    name: "",
    kind: "system",
    moduleId: null,
    permissions: [],
  },
  scope,
  addedBy: null,
  addedAtSetup: false,
  addedAt: "2026-11-01T00:00:00.000000Z",
  notInEffect: [],
});

const roles = [
  role("r-help", "Help desk", null, "custom"),
  role("r-ask", "Ask user", null),
  role("r-auditor", "Auditor", null),
  role("r-admin", "Tenant administrator", null),
];

const catalogue: GrantRow[] = [
  grantRow(
    "invoices",
    "Invoices and Payments",
    true,
    [
      {
        id: "r-inv-viewer",
        name: "Invoices and Payments viewer",
        kind: "system",
      },
      { id: "r-inv-approver", name: "Invoice approver", kind: "custom" },
    ],
    "r-inv-viewer"
  ),
  grantRow(
    "analytics",
    "Analytics",
    false,
    [{ id: "r-an-viewer", name: "Analytics viewer", kind: "system" }],
    "r-an-viewer"
  ),
  {
    ...grantRow(
      "core:ask",
      "Ask",
      true,
      [{ id: "r-ask", name: "Ask user", kind: "system" }],
      "r-ask"
    ),
    group: "core",
  },
];

const advanced: AdvancedCatalogue = {
  core: [],
  record: [option("r-inv-viewer", "invoice")],
  custom: [option("r-inv-approver", "invoice"), option("r-help", null)],
};

it("lists Core first, then each module in catalogue order with its default role marked, and disables a module that is off (T6-a)", () => {
  const groups = roleChoices({ roles, catalogue, advanced });

  expect(
    groups.map((g) => [g.label, g.moduleOff, g.choices.map((c) => c.name)])
  ).toEqual([
    [
      "Core",
      false,
      ["Tenant administrator", "Auditor", "Ask user", "Help desk"],
    ],
    [
      "Invoices and Payments",
      false,
      ["Invoices and Payments viewer", "Invoice approver"],
    ],
    ["Analytics", true, ["Analytics viewer"]],
  ]);

  const [core, invoices, analytics] = groups;

  expect(core?.choices[3]).toMatchObject({
    custom: true,
    recordType: null,
    disabled: false,
  });
  expect(invoices?.choices[0]).toMatchObject({
    isDefault: true,
    recordType: "invoice",
    disabled: false,
  });
  expect(invoices?.choices[1]).toMatchObject({
    isDefault: false,
    custom: true,
    recordType: "invoice",
  });
  expect(analytics?.choices[0]).toMatchObject({ disabled: true, hint: null });
  expect(
    roleChoices({ roles, catalogue, advanced, moduleId: "invoices" }).map(
      (g) => g.label
    )
  ).toEqual(["Invoices and Payments"]);
});

it("disables a role held directly at all records and names the group of a role held through it (T6-b)", () => {
  const riley = { type: "user", id: "p-riley", name: "Riley Chen" } as const;

  const finance = {
    type: "group",
    id: "g-fin",
    name: "Finance team",
    source: "idp",
  } as const;

  const groups = roleChoices({
    roles,
    catalogue,
    advanced,
    recipient: { type: "user", id: "p-riley" },
    paths: [
      path(riley, "r-inv-viewer"),
      path(finance, "r-inv-approver"),
      path(riley, "r-auditor", { type: "invoice", id: "INV-1" }),
    ],
  });

  const choice = (name: string) =>
    groups.flatMap((g) => g.choices).find((c) => c.name === name);

  expect(choice("Invoices and Payments viewer")).toMatchObject({
    disabled: true,
    hint: "Already assigned",
  });
  expect(choice("Invoice approver")).toMatchObject({
    disabled: false,
    hint: "Assigned via Finance team",
  });
  expect(choice("Auditor")).toMatchObject({ disabled: false, hint: null });
});

it("names one, two, three and four recipients, and the ones that already had the role (T6-c)", () => {
  expect(addedMessage("Slides editor", ["Riley Chen"], [])).toBe(
    "Assigned Slides editor to Riley Chen."
  );
  expect(
    addedMessage("Slides editor", ["Riley Chen", "Finance team"], [])
  ).toBe("Assigned Slides editor to Riley Chen and Finance team.");
  expect(
    addedMessage(
      "Slides editor",
      ["Riley Chen", "Finance team", "Ada Quinn"],
      []
    )
  ).toBe("Assigned Slides editor to Riley Chen, Finance team and Ada Quinn.");
  expect(addedMessage("Slides editor", ["A", "B", "C", "D"], [])).toBe(
    "Assigned Slides editor to 4 people and groups."
  );
  expect(addedMessage("Slides editor", ["Riley Chen"], ["Finance team"])).toBe(
    "Assigned Slides editor to Riley Chen. Finance team already had it."
  );
  expect(addedMessage("Slides editor", [], ["Riley Chen"])).toBe(
    "Riley Chen already had Slides editor."
  );
});

it("maps the server's recipients to the picked names in the server's order", () => {
  const picked: RecipientRow[] = [
    {
      type: "user",
      id: "p-riley",
      name: "Riley Chen",
      email: "riley.chen@example.com",
      assignedRoles: 0,
    },
    {
      type: "group",
      id: "g-fin",
      name: "Finance team",
      source: "idp",
      memberCount: 17,
      archived: false,
      assignedRoles: 0,
    },
  ];

  expect(
    namesOf(
      [
        { type: "group", id: "g-fin" },
        { type: "user", id: "p-riley" },
      ],
      picked
    )
  ).toEqual(["Finance team", "Riley Chen"]);

  // A person and a group can share an id string; the type keeps them apart.
  expect(namesOf([{ type: "user", id: "g-fin" }], picked)).toEqual([]);
});

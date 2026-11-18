import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type {
  AccessPage,
  AccessPath,
} from "../../services/roles/effective-access.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";
import type { RoleChoice, RoleChoiceGroup } from "./add-assignment-view.ts";
import { scopeKey } from "./advanced-view.ts";
import { ModuleSheet } from "./module-sheet.tsx";

const choice = (
  roleId: string,
  name: string,
  extra: Partial<RoleChoice> = {}
): RoleChoice => ({
  roleId,
  name,
  custom: false,
  isDefault: false,
  recordType: null,
  disabled: false,
  hint: null,
  ...extra,
});

const ROLES: readonly RoleChoiceGroup[] = [
  {
    label: "Invoices and Payments",
    moduleOff: false,
    choices: [
      choice("r-inv-user", "Invoices and Payments user"),
      choice("r-inv-viewer", "Invoices and Payments viewer", {
        isDefault: true,
      }),
    ],
  },
];

const MODULE = {
  id: "invoices",
  displayName: "Invoices and Payments",
  description: "Invoices, payments and their documents.",
  enabled: true,
};

const role = (id: string, name: string, kind: "system" | "custom" = "system") =>
  ({
    id,
    name,
    kind,
    moduleId: "invoices",
    permissions: ["invoices:use"],
  }) as const;

const FINANCE = {
  type: "group",
  id: "g-fin",
  name: "Finance team",
  source: "idp",
} as const;

const MINA = { type: "user", id: "p-mina", name: "Mina Park" } as const;

const path = (
  assignmentId: string,
  holder: AccessPath["holder"],
  r: AccessPath["role"],
  extra: Partial<AccessPath> = {}
): AccessPath => ({
  assignmentId,
  holder,
  role: r,
  scope: null,
  addedBy: { id: "p-priya", name: "Priya Nair" },
  addedAtSetup: false,
  addedAt: "2026-11-11T10:00:00.000000Z",
  notInEffect: [],
  ...extra,
});

const PAGE: AccessPage = {
  paths: [
    path("a-new", MINA, role("r-inv-viewer", "Invoices and Payments viewer"), {
      scope: { type: "invoice", id: "INV-2210" },
      addedAt: "2026-11-15T10:00:00.000000Z",
    }),
    path(
      "a-fin",
      FINANCE,
      role("r-inv-approver", "Invoice approver", "custom")
    ),
  ],
  total: 7,
  nextCursor: null,
  memberCounts: { "g-fin": 17 },
};

const RILEY: RecipientRow = {
  type: "user",
  id: "p-riley",
  name: "Riley Chen",
  email: "riley.chen@example.com",
  assignedRoles: 1,
};

const meta = {
  title: "Core/Access/ModuleSheet",
  component: ModuleSheet,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A module's sheet on Modules (P12-16): who it is assigned to, newest first, Add assignment with the module's roles and its default role picked, and Manage in Access for the rest. A module that is off offers no Add assignment.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    open: true,
    module: MODULE,
    onClose: fn(),
    page: PAGE,
    recordLabels: new Map([
      [scopeKey({ type: "invoice", id: "INV-2210" }), "INV-2210"],
    ]),
    timeZone: "Europe/London",
    host: {
      roles: ROLES,
      onSearchRecords: fn(async () => []),
      onSubmit: fn(async () => ({
        added: [
          {
            recipient: { type: "user" as const, id: "p-riley" },
            assignmentId: "a-new",
          },
        ],
        skipped: [],
      })),
    },
    search: fn(async () => ({ rows: [RILEY], total: 1 })),
    selfId: "p-priya",
    onManageAccess: fn(),
  } satisfies Parameters<typeof ModuleSheet>[0],
} satisfies Meta<typeof ModuleSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** T9-b: the sheet names the module, "Assigned to (n)", each row, and the way to the Overview. */
export const ModuleSheetListsAssignedTo: Story = {
  play: async ({ args }) => {
    const sheet = within(
      await screen.findByRole("dialog", { name: /Invoices and Payments/ })
    );

    await expect(sheet.getByText("Module on")).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: "Assigned to (7)" })
    ).toBeVisible();

    const items = within(
      sheet.getByRole("list", { name: "Assigned to" })
    ).getAllByRole("listitem");

    await expect(items).toHaveLength(2);
    await expect(items[0]).toHaveTextContent("Mina Park");
    await expect(items[0]).toHaveTextContent("One record · INV-2210");
    await expect(items[0]).toHaveTextContent("Person");
    await expect(items[1]).toHaveTextContent("Finance team");
    await expect(items[1]).toHaveTextContent("Invoice approver · Custom role");
    await expect(items[1]).toHaveTextContent("Directory group · 17 members");
    await expect(items[1]).toHaveTextContent(
      "Assigned 11 Nov 2026 by Priya Nair"
    );
    await userEvent.click(
      sheet.getByRole("button", { name: "Manage in Access" })
    );
    await expect(args.onManageAccess).toHaveBeenCalled();
  },
};

/** T9-c: Add assignment lists the module's roles with its default role picked, and a save tints the row. */
export const ModuleAddAssignmentPicksTheDefaultRole: Story = {
  play: async ({ args }) => {
    let sheet = within(
      await screen.findByRole("dialog", { name: /Invoices and Payments/ })
    );

    await expect(
      within(sheet.getByRole("list", { name: "Assigned to" })).getAllByRole(
        "listitem"
      )[0]
    ).not.toHaveAttribute("data-new");

    await userEvent.click(
      sheet.getByRole("button", { name: "Add assignment" })
    );
    sheet = within(
      await screen.findByRole("dialog", { name: "Invoices and Payments" })
    );
    await expect(
      sheet.getByRole("button", { name: "Back to Invoices and Payments" })
    ).toBeVisible();
    const roleField = sheet.getByRole("combobox", { name: "Role" });

    await expect(roleField).toHaveTextContent("Invoices and Payments viewer");

    await userEvent.click(roleField);
    const options = await screen.findAllByRole("option");

    await expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Invoices and Payments user"),
      expect.stringContaining("Invoices and Payments viewer"),
    ]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(sheet.getByRole("combobox", { name: "Assign to" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Riley Chen/ })
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      sheet.getByRole("button", { name: "Add assignment" })
    );

    await waitFor(() =>
      expect(args.host?.onSubmit).toHaveBeenCalledWith({
        roleId: "r-inv-viewer",
        scope: null,
        recipients: [RILEY],
      })
    );

    const list = within(
      await screen.findByRole("list", { name: "Assigned to" })
    );

    await expect(list.getAllByRole("listitem")[0]).toHaveAttribute("data-new");
  },
};

/** A host whose module turns off on the first Assign to search, as a modules refetch does mid-form. */
function TurnsOffWhileAdding(args: Parameters<typeof ModuleSheet>[0]) {
  const [enabled, setEnabled] = useState(true);

  return (
    <ModuleSheet
      {...args}
      module={{ ...args.module, enabled }}
      search={async (query) => {
        setEnabled(false);

        return args.search(query);
      }}
    />
  );
}

/** Review focus 3: the open form and its values stay when the module turns off; the server refuses the save. */
export const ModuleTurnedOffKeepsTheOpenForm: Story = {
  render: (args) => <TurnsOffWhileAdding {...args} />,
  play: async ({ args }) => {
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: /Invoices and Payments/ })
      ).getByRole("button", { name: "Add assignment" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: "Invoices and Payments" })
    );

    await userEvent.click(sheet.getByRole("combobox", { name: "Assign to" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Riley Chen/ })
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      sheet.getByRole("button", { name: "Add assignment" })
    );

    await waitFor(() =>
      expect(args.host?.onSubmit).toHaveBeenCalledWith({
        roleId: "r-inv-viewer",
        scope: null,
        recipients: [RILEY],
      })
    );
  },
};

/** T9-f (R-37a): a module that is off lists its assignments and offers no Add assignment. */
export const ModuleOffOffersNoAddAssignment: Story = {
  args: { module: { ...MODULE, enabled: false } },
  play: async () => {
    const sheet = within(
      await screen.findByRole("dialog", { name: /Invoices and Payments/ })
    );

    await expect(sheet.getByText("Module off")).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: "Assigned to (7)" })
    ).toBeVisible();
    await expect(
      sheet.queryByRole("button", { name: "Add assignment" })
    ).toBeNull();
  },
};

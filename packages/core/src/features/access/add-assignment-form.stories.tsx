import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { RecipientRow } from "../../services/roles/recipients.ts";
import { AddAssignmentForm } from "./add-assignment-form.tsx";
import type { RoleChoice, RoleChoiceGroup } from "./add-assignment-view.ts";

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
    label: "Core",
    moduleOff: false,
    choices: [
      choice("r-admin", "Tenant administrator"),
      choice("r-auditor", "Auditor"),
      choice("r-ask", "Ask user"),
    ],
  },
  {
    label: "Invoices and Payments",
    moduleOff: false,
    choices: [
      choice("r-inv-viewer", "Invoices and Payments viewer", {
        isDefault: true,
        recordType: "invoice",
      }),
      choice("r-inv-approver", "Invoice approver", {
        custom: true,
        recordType: "invoice",
        hint: "Assigned via Finance team",
      }),
    ],
  },
  {
    label: "Slides",
    moduleOff: false,
    choices: [
      choice("r-slides-editor", "Slides editor", { isDefault: true }),
      choice("r-slides-user", "Slides user", {
        disabled: true,
        hint: "Already assigned",
      }),
    ],
  },
  {
    label: "Analytics",
    moduleOff: true,
    choices: [choice("r-an-editor", "Analytics editor", { disabled: true })],
  },
];

const RILEY: RecipientRow = {
  type: "user",
  id: "p-riley",
  name: "Riley Chen",
  email: "riley.chen@example.com",
  assignedRoles: 1,
};

const FINANCE: RecipientRow = {
  type: "group",
  id: "g-fin",
  name: "Finance team",
  source: "idp",
  memberCount: 17,
  archived: false,
  assignedRoles: 3,
};

const meta = {
  title: "Core/Access/AddAssignmentForm",
  component: AddAssignmentForm,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The one form that adds an assignment (d8l5.62): from a person's, a group's or a module's sheet with its recipient fixed, or from Access with one or more people and groups. Role lists Core first, then each module; One record shows only for a role with a record type. A refusal keeps every value and shows why.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    to: {
      search: fn(async (_query: string) => ({
        rows: [FINANCE, RILEY],
        total: 2,
      })),
      selfId: "p-priya",
    },
    roles: ROLES,
    onSearchRecords: fn(async () => [
      { id: "INV-1042", label: "INV-1042 · Northwind Traders" },
    ]),
    onCancel: fn(),
    onSubmit: fn(async () => {}),
  },
  render: (args) => (
    <div className="flex h-[640px] max-w-md flex-col border border-border">
      <AddAssignmentForm {...args} />
    </div>
  ),
} satisfies Meta<typeof AddAssignmentForm>;

export default meta;

type Story = StoryObj<typeof meta>;

type Play = NonNullable<Story["play"]>;

type Canvas = Parameters<Play>[0]["canvas"];

const pickRole = async (canvas: Canvas, name: string) => {
  await userEvent.click(canvas.getByRole("combobox", { name: "Role" }));
  await userEvent.click(
    await screen.findByRole("option", { name: new RegExp(name) })
  );
};

/** T6-d: Add with no role shows the field error and calls nothing. */
export const AddWithoutRoleShowsFieldError: Story = {
  args: { to: { fixed: RILEY }, backTo: "Riley Chen" },
  play: async ({ args, canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Back to Riley Chen" })
    ).toBeVisible();
    await expect(canvas.getByText("Person")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add assignment" })
    );
    await expect(await canvas.findByText("Choose a role.")).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Role" })
    ).toHaveAttribute("aria-invalid", "true");
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** T6-e (AD5): One record only for a role with a record type. */
export const ScopeOffersOneRecordOnlyForRecordRoles: Story = {
  args: { to: { fixed: RILEY } },
  play: async ({ args, canvas }) => {
    await pickRole(canvas, "Slides editor");
    await expect(canvas.queryAllByRole("radio")).toHaveLength(0);
    await expect(canvas.getByText("All records")).toBeVisible();

    await pickRole(canvas, "Invoices and Payments viewer");
    await userEvent.click(canvas.getByRole("radio", { name: "One record" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Add assignment" })
    );
    await expect(await canvas.findByText("Choose a record.")).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("radio", { name: "All records" }));
    await waitFor(() =>
      expect(canvas.queryByText("Choose a record.")).toBeNull()
    );
    await userEvent.click(canvas.getByRole("radio", { name: "One record" }));

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Choose a record" })
    );
    await userEvent.click(
      await screen.findByRole("option", {
        name: "INV-1042 · Northwind Traders",
      })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add assignment" })
    );
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        roleId: "r-inv-viewer",
        scope: { type: "invoice", id: "INV-1042" },
        recipients: [RILEY],
      })
    );
  },
};

/** T6-f: two chips add two assignments. */
export const TwoRecipientsAddTwo: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Assign to" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Finance team/ })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Riley Chen/ })
    );
    // The list stays open after a pick and hides the chips from the accessibility tree until it closes.
    await userEvent.keyboard("{Escape}");
    await expect(
      await canvas.findByText(
        "Adds 2 assignments, one for each person and group."
      )
    ).toBeVisible();
    await pickRole(canvas, "Slides editor");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add 2 assignments" })
    );
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        roleId: "r-slides-editor",
        scope: null,
        recipients: [FINANCE, RILEY],
      })
    );
  },
};

/**
 * C12-3: a sheet's own group: its tile centers on the name's line, not on the two lines. The
 * runner's icon check (6wz1.113) measures it after the play.
 */
export const FixedGroupTileOnTheNameLine: Story = {
  args: { to: { fixed: FINANCE } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Finance team")).toBeVisible();
    await expect(
      canvas.getByText("Directory group · 17 members")
    ).toBeVisible();
  },
};

/** T6-g (Review Focus 3, C12-10): a refusal keeps the form and says why at the top of the form. */
export const RefusedKeepsTheForm: Story = {
  args: {
    onSubmit: fn(async () => {
      throw {
        message:
          "The Slides module is off. Turn it on in Modules, or choose a role of another module.",
        code: "module-disabled",
      };
    }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Assign to" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Riley Chen/ })
    );
    await userEvent.keyboard("{Escape}");
    await pickRole(canvas, "Slides editor");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add assignment" })
    );

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent("The assignment was not added.");
    await expect(alert).toHaveTextContent("The Slides module is off.");
    await expect(alert).toHaveFocus();
    // The prototype's refused-1440: one block above Assign to, and Modules opens the Modules page.
    await expect(canvas.getAllByRole("alert")).toHaveLength(1);
    await expect(
      alert.compareDocumentPosition(
        canvas.getByRole("combobox", { name: "Assign to" })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await expect(
      within(alert).getByRole("link", { name: "Modules" })
    ).toHaveAttribute("href", "/admin/modules");
    await expect(
      canvas.getByRole("button", { name: "Remove Riley Chen" })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Role" })
    ).toHaveTextContent("Slides editor");
  },
};

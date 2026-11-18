import { Button } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { RecipientRow } from "../../services/roles/recipients.ts";
import type { AddAssignmentHost } from "./add-assignment-form.tsx";
import { AddAssignmentSheet } from "./add-assignment-sheet.tsx";
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
    choices: [choice("r-auditor", "Auditor"), choice("r-ask", "Ask user")],
  },
  {
    label: "Slides",
    moduleOff: false,
    choices: [choice("r-slides-editor", "Slides editor", { isDefault: true })],
  },
];

const FINANCE: RecipientRow = {
  type: "group",
  id: "g-fin",
  name: "Finance team",
  source: "idp",
  memberCount: 17,
  archived: false,
  assignedRoles: 3,
};

const PRIYA: RecipientRow = {
  type: "user",
  id: "p-priya",
  name: "Priya Nair",
  email: "priya.nair@example.com",
  assignedRoles: 2,
};

const RILEY: RecipientRow = {
  type: "user",
  id: "p-riley",
  name: "Riley Chen",
  email: "riley.chen@example.com",
  assignedRoles: 1,
};

/** Opens the sheet from a page-level button, as the Overview route does. */
function Harness(props: { readonly onSubmit: AddAssignmentHost["onSubmit"] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add assignment</Button>
      <AddAssignmentSheet
        open={open}
        onClose={() => setOpen(false)}
        host={{
          roles: ROLES,
          onSearchRecords: async () => [],
          onSubmit: props.onSubmit,
        }}
        search={async () => ({ rows: [FINANCE, PRIYA, RILEY], total: 3 })}
        selfId="p-priya"
        onAdded={fn()}
      />
    </>
  );
}

const meta = {
  title: "Core/Access/AddAssignmentSheet",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Add assignment from Access (d8l5.62): a right sheet, full screen on a phone, with an empty Assign to that lists your own row disabled. A save in flight keeps it open.",
      },
    },
    a11y: { test: "error" },
  },
  args: { onSubmit: fn(async () => ({ added: [], skipped: [] })) },
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

/** T8-f: the header button opens the sheet with an empty Assign to and the viewer disabled. */
export const AddAssignmentPanel: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Add assignment" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: "Add assignment" })
    );

    await expect(
      sheet.queryAllByRole("button", { name: /^Remove / })
    ).toHaveLength(0);

    await userEvent.click(sheet.getByRole("combobox", { name: "Assign to" }));
    await expect(
      await screen.findByRole("option", { name: /Priya Nair \(you\)/ })
    ).toHaveAttribute("aria-disabled", "true");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(sheet.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Add assignment" })
      ).toBeNull()
    );
  },
};

/** T8-f2 (Review Focus 4): while the save runs, Close is disabled and Escape keeps the sheet. */
export const SavingKeepsTheSheetOpen: Story = {
  args: { onSubmit: fn(() => new Promise<never>(() => undefined)) },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Add assignment" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: "Add assignment" })
    );

    await userEvent.click(sheet.getByRole("combobox", { name: "Assign to" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Riley Chen/ })
    );
    await userEvent.keyboard("{Escape}");

    await userEvent.click(sheet.getByRole("combobox", { name: "Role" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Slides editor/ })
    );
    await userEvent.click(
      sheet.getByRole("button", { name: "Add assignment" })
    );

    await expect(sheet.getByRole("button", { name: "Close" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(
      screen.getByRole("dialog", { name: "Add assignment" })
    ).toBeVisible();
  },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import { fixtureRow } from "./__fixtures__/access.ts";
import { RoleChoice } from "./role-choice.tsx";

const invoices = fixtureRow("invoices");

const meta = {
  title: "Core/Access/RoleChoice",
  component: RoleChoice,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The role of one Granted row on the Access Grants tab (R-37a). The default access role comes first and reads "(default)". A staged change shows the saved role struck through. A row with one role shows its name as text. A switched-off module shows the choice disabled with its reason.',
      },
    },
    a11y: { test: "error" },
  },
  args: {
    rowName: invoices.name,
    roles: invoices.roles,
    defaultRoleId: invoices.defaultRoleId,
    value: "r-invoices-viewer",
    onChange: fn(),
  },
} satisfies Meta<typeof RoleChoice>;

export default meta;

type Story = StoryObj<typeof meta>;

/** T5: the default first, then the others in order; a pick sends the role id. */
export const Default: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Role for Invoices" })
    );

    const options = await screen.findAllByRole("option");

    await expect(options.map((option) => option.textContent)).toEqual([
      "Viewer (default)",
      "Invoices and Payments user",
      "Finance",
      "Invoice auditor",
    ]);

    await userEvent.click(screen.getByRole("option", { name: "Finance" }));
    await waitFor(() =>
      expect(args.onChange).toHaveBeenCalledWith("r-invoices-finance")
    );
  },
};

/** T6: a staged swap shows the saved role struck through, read as "Was". */
export const Changed: Story = {
  args: { value: "r-invoices-finance", savedRoleId: "r-invoices-viewer" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("deletion")).toHaveTextContent("Was Viewer");
    await expect(
      canvas.getByRole("combobox", { name: "Role for Invoices" })
    ).toHaveTextContent("Finance");
  },
};

/** T7: one role is plain text, never a select with one option. */
export const OneRole: Story = {
  args: {
    rowName: "Slides",
    roles: fixtureRow("slides").roles,
    defaultRoleId: "r-slides-editor",
    value: "r-slides-editor",
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("combobox")).toBeNull();
    await expect(canvas.getByText("Slides editor")).toBeVisible();
  },
};

/** G8: a switched-off module shows the choice disabled and announces why. */
export const Disabled: Story = {
  args: {
    rowName: "Analytics",
    roles: fixtureRow("analytics").roles,
    defaultRoleId: "r-analytics-editor",
    value: "r-analytics-viewer",
    disabledReason: "Analytics is switched off for this deployment.",
  },
  play: async ({ canvas }) => {
    const choice = canvas.getByRole("combobox", { name: "Role for Analytics" });

    await expect(choice).toBeDisabled();
    await expect(choice).toHaveAccessibleDescription(
      "Analytics is switched off for this deployment."
    );
  },
};

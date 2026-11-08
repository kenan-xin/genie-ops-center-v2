import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import type { AccessRecipient } from "../../services/roles/effective-access.ts";
import { FIXTURE_RECIPIENTS } from "./__fixtures__/access.ts";
import { RecipientPicker } from "./recipient-picker.tsx";

type Args = {
  readonly kind: "group" | "user";
  readonly onPick: (recipient: AccessRecipient) => void;
};

/** Holds the pick the way the screen does, so the trigger shows it. */
function Harness({ kind, onPick }: Args) {
  const [value, setValue] = React.useState<AccessRecipient | null>(null);

  return (
    <div className="max-w-sm">
      <RecipientPicker
        kind={kind}
        recipients={FIXTURE_RECIPIENTS}
        value={value}
        onPick={(recipient) => {
          onPick(recipient);
          setValue(recipient);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Core/Access/RecipientPicker",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Who the Access Grants tab edits: a group, or a person as the exception (R-37a). The trigger opens a searchable list. A group reads its member count, and a person reads the email, because two people can share a name.",
      },
    },
    a11y: { test: "error" },
  },
  args: { kind: "group", onPick: fn() },
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Groups: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Choose a group" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance team · 12 members" })
    );

    await waitFor(() =>
      expect(args.onPick).toHaveBeenCalledWith({
        type: "group",
        id: "g-finance",
      })
    );
    // axe runs after play, and a closing popup still holds its focus guards.
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    );
  },
};

/** T9: an email tells two people of one name apart. */
export const People: Story = {
  args: { kind: "user" },
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Choose a person" })
    );
    await userEvent.type(
      await screen.findByRole("combobox", { name: "Search people" }),
      "a.morgan"
    );

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await userEvent.click(
      screen.getByRole("option", { name: "Alex Morgan · a.morgan@example.com" })
    );

    await waitFor(() =>
      expect(args.onPick).toHaveBeenCalledWith({ type: "user", id: "p-alex-2" })
    );
    await expect(
      canvas.getByRole("combobox", { name: "Choose a person" })
    ).toHaveTextContent("Alex Morgan · a.morgan@example.com");
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    );
  },
};

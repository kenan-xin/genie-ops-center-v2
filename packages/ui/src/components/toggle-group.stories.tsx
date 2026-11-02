import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

// The package entry, so that the stories prove what an app can import.
import { ToggleGroup, ToggleGroupItem } from "../index.ts";

const STATUSES = ["All", "Open", "Overdue", "Paid"] as const;

/** One pressed chip at a time, and All stays pressed when the pressed chip is clicked again. */
function StatusChips() {
  const [status, setStatus] = useState<string>("All");

  return (
    <ToggleGroup
      aria-label="Status"
      value={[status]}
      onValueChange={(value) => setStatus(value[0] ?? status)}
    >
      {STATUSES.map((label) => (
        <ToggleGroupItem key={label} value={label}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const meta = {
  title: "UI/ToggleGroup",
  component: ToggleGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn ToggleGroup on the Base UI primitive (`@base-ui/react/toggle-group`), trimmed to filter chips. Each `ToggleGroupItem` is a button with `aria-pressed`; the group is single choice unless `multiple` is set. `value` is an array of the pressed values. For a filter that always has a choice, keep the old value when `onValueChange` answers an empty array, as this story does.",
      },
    },
    a11y: { test: "error" },
  },
  render: () => <StatusChips />,
} satisfies Meta<typeof ToggleGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dark: Story = { globals: { theme: "dark" } };

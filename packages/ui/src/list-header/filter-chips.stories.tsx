import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { FilterChips, type FilterChip } from "../index.ts";

type Value = {
  readonly id: string;
  readonly label: string;
  readonly filter?: string;
};

const applied: readonly Value[] = [
  { id: "dates", label: "Last 3 months" },
  { id: "region", label: "North", filter: "Region" },
  { id: "customer", label: "A, B Ltd", filter: "Customer" },
  { id: "overdue", label: "Overdue", filter: "Overdue" },
];

// A render that removes a chip for real, so the focus move meets a list that loses an item.
function Live(props: { readonly values: readonly Value[] }) {
  const [values, setValues] = useState(props.values);

  const chips: FilterChip[] = values.map((value) => ({
    id: value.id,
    label: value.label,
    set: value.id === "dates",
    remove: value.filter
      ? {
          name: `Remove ${value.filter} filter`,
          onRemove: () =>
            setValues((now) => now.filter((each) => each.id !== value.id)),
        }
      : undefined,
  }));

  return <FilterChips label="Applied filters" chips={chips} />;
}

const meta = {
  title: "UI/List header/FilterChips",
  component: FilterChips,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The applied filters of a phone header as chips in one row that scrolls sideways (`czjw.159`). A set value takes the `filter-set` tint. A chip with a remove action has a 28 px remove button with a 44 px target; a remove moves the focus to the next chip's remove button, else the previous one, else the row.",
      },
    },
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  args: { label: "Applied filters", chips: [] },
  render: () => <Live values={applied} />,
} satisfies Meta<typeof FilterChips>;

export default meta;

type Story = StoryObj<typeof meta>;

// D1
export const RemoveKeepsTheFocus: Story = {
  name: "Remove keeps the focus",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("list", { name: "Applied filters" });
    await expect(within(list).getAllByRole("button")).toHaveLength(3);

    canvas.getByRole("button", { name: "Remove Customer filter" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.queryByText("A, B Ltd")).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Remove Overdue filter" })
    ).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect(
      canvas.getByRole("button", { name: "Remove Region filter" })
    ).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect(list).toHaveFocus();
  },
};

// D2
export const RemoveTarget: Story = {
  name: "Remove target",
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", {
      name: "Remove Region filter",
    });

    const box = button.getBoundingClientRect();
    const middleX = box.left + box.width / 2;
    const middleY = box.top + box.height / 2;

    await expect(document.elementFromPoint(box.left - 7, middleY)).toBe(button);
    await expect(document.elementFromPoint(middleX, box.top - 7)).toBe(button);
  },
};

// D3
export const ScrollsSideways: Story = {
  name: "Scrolls sideways",
  render: () => (
    <Live
      values={[
        ...applied,
        {
          id: "long",
          label: "Northern Regional Wholesale Supplies Ltd",
          filter: "Supplier",
        },
        { id: "status", label: "Open", filter: "Status" },
        { id: "owner", label: "Me", filter: "Owner" },
        { id: "currency", label: "EUR", filter: "Currency" },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", {
      name: "Applied filters",
    });

    await expect(list.scrollWidth).toBeGreaterThan(list.clientWidth);
    const page = document.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

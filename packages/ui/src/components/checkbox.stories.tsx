import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { Checkbox, FieldLabel } from "../index.ts";

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Checkbox on the Base UI primitive (`@base-ui/react/checkbox`). Name it with a `FieldLabel` that wraps it. Space toggles it, and it takes the shared focus ring. An invisible area grows the 16 px box to a 44 px target.",
      },
    },
  },
  args: { onCheckedChange: fn() },
  render: (args) => (
    <FieldLabel className="items-center gap-2">
      <Checkbox {...args} />
      Show archived
    </FieldLabel>
  ),
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const box = canvas.getByRole("checkbox", { name: "Show archived" });
    await expect(box).not.toBeChecked();

    await userEvent.tab();
    await expect(box).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(box).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(
      true,
      expect.anything()
    );

    await userEvent.click(canvas.getByText("Show archived"));
    await expect(box).not.toBeChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByText("Show archived"), {
      pointerEventsCheck: 0,
    });
    await expect(
      canvas.getByRole("checkbox", { name: "Show archived" })
    ).not.toBeChecked();
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};

export const Dark: Story = { ...Default, globals: { theme: "dark" } };

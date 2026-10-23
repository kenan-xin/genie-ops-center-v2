import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { FieldLabel, RadioGroup, RadioGroupItem } from "../index.ts";

const meta = {
  title: "UI/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn RadioGroup on the Base UI primitive (`@base-ui/react/radio-group`). Name the group with `aria-labelledby`, and each item with a `FieldLabel` that wraps it. Arrow keys move the choice; Tab leaves the group.",
      },
    },
  },
  args: { defaultValue: "invite", onValueChange: fn() },
  render: (args) => (
    <div className="flex flex-col gap-2">
      <span id="mode-label" className="text-sm font-medium">
        Onboarding mode
      </span>
      <RadioGroup {...args} aria-labelledby="mode-label">
        <FieldLabel className="items-center gap-2">
          <RadioGroupItem value="invite" />
          Invite only
        </FieldLabel>
        <FieldLabel className="items-center gap-2">
          <RadioGroupItem value="jit" />
          Just-in-time
        </FieldLabel>
      </RadioGroup>
    </div>
  ),
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const invite = canvas.getByRole("radio", { name: "Invite only" });
    const jit = canvas.getByRole("radio", { name: "Just-in-time" });

    await expect(
      canvas.getByRole("radiogroup", { name: "Onboarding mode" })
    ).toBeVisible();
    await expect(invite).toBeChecked();

    await userEvent.tab();
    await expect(invite).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(jit).toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith(
      "jit",
      expect.anything()
    );

    await userEvent.click(canvas.getByText("Invite only"));
    await expect(invite).toBeChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByText("Just-in-time"), {
      pointerEventsCheck: 0,
    });
    await expect(
      canvas.getByRole("radio", { name: "Invite only" })
    ).toBeChecked();
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

export const Dark: Story = { ...Default, globals: { theme: "dark" } };

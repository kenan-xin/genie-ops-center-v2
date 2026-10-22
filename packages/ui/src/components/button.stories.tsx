import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

// The package entry, not ./button.tsx, so that the stories prove what an app
// can import.
import { Button } from "../index.ts";

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Button on the Base UI primitive (`@base-ui/react/button`). It renders a native button, so a pointer, Enter and Space activate it, and a disabled button leaves the tab order.",
      },
    },
  },
  args: {
    children: "Save changes",
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));

    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const ActivatesFromTheKeyboard: Story = {
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save changes" });

    await userEvent.tab();
    await expect(button).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save changes" });

    await expect(button).toBeDisabled();

    await userEvent.tab();
    await expect(button).not.toHaveFocus();

    // pointer-events: none on a disabled button makes userEvent refuse the
    // click, so the check is skipped to prove the handler stays silent.
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Outline: Story = {
  args: { variant: "outline" },
};

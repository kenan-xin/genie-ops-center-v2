import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import {
  Button,
  HelpDisclosure,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../index.ts";

const meta = {
  title: "UI/HelpDisclosure",
  component: HelpDisclosure,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A help control that opens a short panel under it, only on a press. The trigger carries `aria-expanded` and `aria-controls`. Escape closes the panel and returns focus to the trigger.",
      },
    },
  },
  args: {
    label: "How access works",
    children: <button type="button">Show the group list</button>,
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta<typeof HelpDisclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "How access works" });

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("group")).toBeNull();

    await userEvent.click(trigger);

    const panel = await canvas.findByRole("group", {
      name: "How access works",
    });

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true")
    );
    await expect(trigger.getAttribute("aria-controls")).toBe(panel.id);

    // Focus sits inside the panel, so that Escape has to move it back.
    const inside = await canvas.findByRole("button", {
      name: "Show the group list",
    });

    await waitFor(() => {
      inside.focus();

      return expect(inside).toHaveFocus();
    });

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false")
    );
    await waitFor(() => expect(canvas.queryByRole("group")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true")
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "How access works" })
    );
    await expect(
      canvas.getByRole("group", { name: "How access works" })
    ).toBeVisible();
  },
};

export const InsideASheet: Story = {
  render: (args) => (
    <Sheet>
      <SheetTrigger render={<Button variant="secondary" />}>
        Open person
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Alex Morgan</SheetTitle>
        </SheetHeader>
        <HelpDisclosure {...args} />
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open person" }));

    const sheet = await screen.findByRole("dialog", { name: "Alex Morgan" });

    const trigger = await screen.findByRole("button", {
      name: "How access works",
    });

    await userEvent.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true")
    );

    const inside = await screen.findByRole("button", {
      name: "Show the group list",
    });

    // The sheet may still move its initial focus, so focus until it holds.
    await waitFor(() => {
      inside.focus();

      return expect(inside).toHaveFocus();
    });

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    await expect(sheet).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

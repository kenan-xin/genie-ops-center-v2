import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

// The package entry, not ./sheet.tsx, so that the stories prove what an app
// can import.
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../index.ts";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Sheet on the Base UI dialog (`@base-ui/react/dialog`). The right sheet is full height and full width, and 480 px wide from 768 px. It shares the dialog scrim, focus trap and focus return, and it fades in with no scale.",
      },
    },
  },
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button variant="secondary" />}>
        Open person
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Alex Morgan</SheetTitle>
          <SheetDescription>alex.morgan@example.test</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

const openFromKeyboard = async () => {
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  const sheet = await screen.findByRole("dialog", { name: "Alex Morgan" });

  // The popup fades in and slides, so wait until it rests.
  await waitFor(() =>
    expect(sheet.getBoundingClientRect().right).toBe(window.innerWidth)
  );

  return sheet;
};

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async () => {
    const rect = (await openFromKeyboard()).getBoundingClientRect();

    await expect(rect.width).toBe(480);
    await expect(rect.height).toBe(window.innerHeight);
    await expect(rect.right).toBe(window.innerWidth);
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async () => {
    const rect = (await openFromKeyboard()).getBoundingClientRect();

    await expect(rect.width).toBe(window.innerWidth);
    await expect(rect.height).toBe(window.innerHeight);
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async () => {
    await openFromKeyboard();
  },
};

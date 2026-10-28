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
          "The shadcn Sheet on the Base UI dialog (`@base-ui/react/dialog`). The right sheet is full height and full width on a phone. From 768 px it is a 480 px inset slide-over, 12 px from the top, bottom and right edges, with all four corners rounded (`tokens.md`, Radius). It shares the dialog scrim, focus trap and focus return, and it fades in with no scale.",
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

// From 768 px the sheet floats 12 px off the right edge.
const openFromKeyboard = async (inset = window.innerWidth >= 768 ? 12 : 0) => {
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  const sheet = await screen.findByRole("dialog", { name: "Alex Morgan" });

  // The popup fades in and slides, so wait until it rests.
  await waitFor(() =>
    expect(sheet.getBoundingClientRect().right).toBe(window.innerWidth - inset)
  );

  return sheet;
};

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async () => {
    const sheet = await openFromKeyboard();
    const rect = sheet.getBoundingClientRect();

    // The inset slide-over of the captures: it floats 12 px off three edges, all corners round.
    await expect(rect.width).toBe(480);
    await expect(rect.top).toBe(12);
    await expect(rect.height).toBe(window.innerHeight - 24);
    await expect(getComputedStyle(sheet).borderTopLeftRadius).toBe("12px");
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

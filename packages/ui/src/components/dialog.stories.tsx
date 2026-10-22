import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

// The package entry, not ./dialog.tsx, so that the stories prove what an app
// can import.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
  Input,
} from "../index.ts";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Dialog on the Base UI primitive (`@base-ui/react/dialog`). From 768 px it is centered and 480 px wide. Below, it is full width, anchored to the bottom, and its footer is the bottom action bar. The scrim is `bg-black/40`, focus is trapped, Escape closes, and focus returns to the opener. The title gives the accessible name.",
      },
    },
  },
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>
        New person
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>
            They get access once an administrator assigns a role.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="person-email">Email</FieldLabel>
          <Input id="person-email" type="email" />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Cancel
          </DialogClose>
          <Button>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

const openFromKeyboard = async () => {
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  const dialog = await screen.findByRole("dialog", { name: "Add person" });

  // The popup fades in, so wait until it paints.
  await waitFor(() => expect(dialog).toBeVisible());

  return dialog;
};

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async () => {
    const dialog = await openFromKeyboard();
    const rect = dialog.getBoundingClientRect();

    await expect(rect.width).toBe(480);
    await expect(
      Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2)
    ).toBeLessThanOrEqual(1);
    await expect(
      Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2)
    ).toBeLessThanOrEqual(1);

    const add = screen.getByRole("button", { name: "Add" });

    // Close, the email field, Cancel, then Add.
    screen.getByRole("button", { name: "Close" }).focus();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();

    await expect(add).toHaveFocus();
    await expect(add.getBoundingClientRect().height).toBe(40);
    await expect(getComputedStyle(add).boxShadow).toContain("rgb(37, 99, 235)");
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async () => {
    const dialog = await openFromKeyboard();
    const rect = dialog.getBoundingClientRect();

    await expect(rect.width).toBe(window.innerWidth);
    await expect(rect.bottom).toBe(window.innerHeight);
    await expect(dialog.lastElementChild).toHaveAttribute(
      "data-slot",
      "dialog-footer"
    );
  },
};

export const FocusStaysInside: Story = {
  play: async () => {
    const dialog = await openFromKeyboard();
    const first = screen.getByRole("button", { name: "Close" });

    screen.getByRole("button", { name: "Add" }).focus();
    await userEvent.tab();
    // A focus guard catches the Tab and hands the focus on.
    await waitFor(() => expect(first).toHaveFocus());
    await expect(dialog.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await expect(
      screen.getByRole("button", { name: "New person" })
    ).toHaveFocus();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async () => {
    await openFromKeyboard();
  },
};

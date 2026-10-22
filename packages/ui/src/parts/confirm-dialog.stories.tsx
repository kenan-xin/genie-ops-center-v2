import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, not ./confirm-dialog.tsx, so that the stories prove what
// an app can import.
import {
  Button,
  ConfirmDialog,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../index.ts";
import type { ConfirmDialogProps } from "../index.ts";

type Args = Pick<ConfirmDialogProps, "danger" | "onConfirm" | "onClose">;

const Remove = ({ danger, onConfirm, onClose }: Args) => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        title="Remove Alex Morgan?"
        description="Alex loses access right away. This cannot be undone."
        confirmLabel="Remove person"
        danger={danger}
        onConfirm={onConfirm}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </>
  );
};

const meta = {
  title: "UI/ConfirmDialog",
  component: Remove,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The one confirm dialog, built on `Dialog`. The title names the object, the description is one sentence of consequence, and Cancel takes the focus. Escape, the scrim and Cancel call `onClose`. Confirm calls only `onConfirm`; the caller closes it. `danger` is required, so that no caller gets a tone by default. Render it inside a `SheetContent` to raise it from a sheet: one Escape then closes only the confirm dialog.",
      },
    },
  },
  args: { danger: true, onConfirm: fn(), onClose: fn() },
  globals: { viewport: { value: "desktop", isRotated: false } },
  render: (args) => <Remove {...args} />,
} satisfies Meta<typeof Remove>;

export default meta;

type Story = StoryObj<typeof meta>;

const openConfirm = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Remove" }));

  const dialog = await screen.findByRole("dialog", {
    name: "Remove Alex Morgan?",
  });

  // The popup fades in, so wait until it paints.
  await waitFor(() => expect(dialog).toBeVisible());

  return dialog;
};

const confirmButton = () =>
  screen.getByRole("button", { name: "Remove person" });

export const Default: Story = {
  play: async ({ args }) => {
    await openConfirm();

    await expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await expect(getComputedStyle(confirmButton()).backgroundColor).toBe(
      "rgb(220, 38, 38)"
    );

    await userEvent.click(confirmButton());
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const EscapeCancels: Story = {
  play: async ({ args }) => {
    await openConfirm();
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await expect(screen.getByRole("button", { name: "Remove" })).toHaveFocus();
  },
};

export const ScrimCancels: Story = {
  play: async ({ args }) => {
    await openConfirm();
    await userEvent.click(
      document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!
    );

    await waitFor(() => expect(args.onClose).toHaveBeenCalledTimes(1));
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

export const NotDanger: Story = {
  args: { danger: false },
  play: async () => {
    await openConfirm();

    await expect(getComputedStyle(confirmButton()).backgroundColor).toBe(
      "rgb(37, 99, 235)"
    );
  },
};

const InSheet = ({ danger, onConfirm, onClose }: Args) => (
  <Sheet>
    <SheetTrigger render={<Button variant="secondary" />}>
      Open person
    </SheetTrigger>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Alex Morgan</SheetTitle>
      </SheetHeader>
      <div className="px-4">
        <Remove danger={danger} onConfirm={onConfirm} onClose={onClose} />
      </div>
    </SheetContent>
  </Sheet>
);

export const InsideASheet: Story = {
  render: (args) => <InSheet {...args} />,
  play: async () => {
    await userEvent.click(screen.getByRole("button", { name: "Open person" }));
    await screen.findByRole("dialog", { name: "Alex Morgan" });

    await openConfirm();
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Remove Alex Morgan?" })
      ).not.toBeInTheDocument()
    );
    await expect(
      screen.getByRole("dialog", { name: "Alex Morgan" })
    ).toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "Remove" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async () => {
    await openConfirm();
  },
};

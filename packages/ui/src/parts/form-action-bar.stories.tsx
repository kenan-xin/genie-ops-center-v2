import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormActionBar,
} from "../index.ts";

// The copy of each error kind, as the application's catalogue writes it for the idle timeout.
const NOT_SAVED = "The idle timeout was not saved.";

const KEPT = "Your change is kept.";

const copy = (cause: string) => `${NOT_SAVED} ${cause} ${KEPT}`;

const buttons = (
  <>
    <Button variant="secondary">Discard</Button>
    <Button>Save</Button>
  </>
);

const meta = {
  title: "UI/FormActionBar",
  component: FormActionBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The action bar of a form that saves: a failed save shows here, left of the buttons on desktop and above them on a phone, as an alert that takes focus. There is no Retry: Save is the retry. `status` is the line that the bar shows while no failure shows, for example what a form will save. `placement` adds the rule of a dialog or section footer. A dialog footer stays at the bottom of a dialog that scrolls, and a section footer stays at the bottom of the screen on a phone.",
      },
    },
  },
  args: { failure: null, children: buttons },
} satisfies Meta<typeof FormActionBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Network: Story = {
  args: {
    failure: copy("The server could not be reached. Check your connection."),
  },
};

export const Timeout: Story = {
  args: { failure: copy("The server did not answer in time.") },
};

export const Refused: Story = {
  args: { failure: copy("You do not have permission to make this change.") },
};

export const Conflict: Story = {
  args: {
    failure: copy(
      "Someone else changed this in the meantime. Reload the page to see it."
    ),
  },
};

export const Invalid: Story = {
  args: { failure: copy("Some values are not valid. Fix the marked fields.") },
};

/** Inside a dialog, a rule separates the bar from the fields above it. */
export const InDialog: Story = {
  ...Network,
  args: { ...Network.args, placement: "dialog" },
  // The padding of `DialogContent`, which the bar's negative margins match.
  decorators: [
    (Story) => (
      <div className="bg-card p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
};

/** Under a form section, the bar stays at the bottom of the screen on a phone. */
export const InSection: Story = {
  ...Network,
  args: { ...Network.args, placement: "section" },
};

export const NetworkOnPhone: Story = {
  ...Network,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const NetworkDark: Story = { ...Network, globals: { theme: "dark" } };

export const NetworkDarkOnPhone: Story = {
  ...Network,
  globals: {
    theme: "dark",
    viewport: { value: "mobile1", isRotated: false },
  },
};

function SaveThatFails(props: { readonly failure: string }) {
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <FormActionBar failure={failure}>
      <Button variant="secondary" onClick={() => setFailure(null)}>
        Discard
      </Button>
      <Button onClick={() => setFailure(props.failure)}>Save</Button>
    </FormActionBar>
  );
}

function StatusThatFails() {
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <FormActionBar
      failure={failure}
      status={
        <>
          Access to <strong>Invoices and Ask</strong>
        </>
      }
    >
      <Button variant="secondary" onClick={() => setFailure(null)}>
        Clear
      </Button>
      <Button onClick={() => setFailure(copy("The server did not answer."))}>
        Fail
      </Button>
    </FormActionBar>
  );
}

/** The status says what the form will save, and gives way to a failure while one shows. */
export const StatusBesideTheButtons: Story = {
  render: () => <StatusThatFails />,
  play: async ({ canvas }) => {
    const status = () => canvas.queryByText("Invoices and Ask");

    await expect(status()).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Fail" }));
    await expect(await canvas.findByRole("alert")).toHaveFocus();
    await expect(status()).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(status()).toBeVisible();
  },
};

/** In a dialog taller than the screen, the bar stays in view while the body is at its top. */
export const DialogBarStaysInView: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>
        Add person
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        {Array.from({ length: 40 }, (_, index) => (
          <p key={index}>Line {index + 1} of a long form.</p>
        ))}
        <FormActionBar failure={null} placement="dialog" status="No access yet">
          {buttons}
        </FormActionBar>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = await screen.findByRole("dialog", { name: "Add person" });

    await waitFor(() => expect(dialog).toBeVisible());
    await expect(dialog.scrollTop).toBe(0);

    const save = screen.getByRole("button", { name: "Save" });

    await expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight
    );

    // The bar reaches the dialog's bottom edge, so no scrolled line shows below it.
    const bar = save.parentElement?.parentElement;

    await expect(
      Math.abs(
        (bar?.getBoundingClientRect().bottom ?? 0) -
          dialog.getBoundingClientRect().bottom
      )
    ).toBeLessThanOrEqual(1);
  },
};

/** A failed save moves focus to its alert, every time it fails, so the person hears it. */
export const FocusOnFailure: Story = {
  render: () => (
    <SaveThatFails
      failure={copy("The server could not be reached. Check your connection.")}
    />
  ),
  play: async ({ canvas }) => {
    const save = canvas.getByRole("button", { name: "Save" });

    await userEvent.click(save);

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveFocus();
    // The failure reads before the buttons, so it sits left of them or above them.
    await expect(
      alert.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));
    await expect(canvas.queryByRole("alert")).toBeNull();

    await userEvent.click(save);
    await expect(await canvas.findByRole("alert")).toHaveFocus();
  },
};

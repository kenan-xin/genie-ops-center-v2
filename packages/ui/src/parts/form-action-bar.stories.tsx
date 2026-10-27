import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent } from "storybook/test";

import { Button, FormActionBar } from "../index.ts";

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
          "The action bar of a form that saves: a failed save shows here, left of the buttons on desktop and above them on a phone, as an alert that takes focus. There is no Retry: Save is the retry. `placement` adds the rule of a dialog or section footer; a section footer stays at the bottom of the screen on a phone.",
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

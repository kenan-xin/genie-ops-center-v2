import { CORE_ERROR_MESSAGES } from "@genie/core/errors";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";

import { NewDeckComposer } from "./new-deck-composer.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const REFUSAL = CORE_ERROR_MESSAGES["agent-run-limit"];

type Props = Parameters<typeof NewDeckComposer>[0];

/** The page's part: a submit sets `saving`, or `failure` when `refuse` is set. */
function Page(props: Props & { readonly refuse?: boolean }) {
  const [saving, setSaving] = useState(props.saving);
  const [failure, setFailure] = useState(props.failure);

  return (
    <NewDeckComposer
      saving={saving}
      failure={failure}
      onCancel={props.onCancel}
      onSubmit={(description) => {
        props.onSubmit(description);

        if (props.refuse === true) setFailure(REFUSAL);
        else setSaving(true);
      }}
    />
  );
}

const meta = {
  title: "Modules/Slides/New deck composer",
  component: NewDeckComposer,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The inline composer under the Slides list header (S7-48). The person describes the deck, and Create deck starts the agent on a new deck. Enter creates, Shift and Enter start a new line. A starter fills the text box. Below 768 px Cancel and Create deck share the full width.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    saving: false,
    failure: null,
    onCancel: fn(),
    onSubmit: fn(),
  },
  render: (args) => <Page {...args} />,
  globals: desktop,
} satisfies Meta<typeof NewDeckComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

const textbox = (canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]) =>
  canvas.getByRole("textbox", { name: "What is the deck about?" });

// Bug caught: the description is sent untrimmed, or a second Enter while saving starts a second deck.
export const EnterCreates: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.type(
      textbox(canvas),
      "  October collections {Shift>}{Enter}{/Shift}"
    );
    await userEvent.keyboard("{Enter}");

    await expect(args.onSubmit).toHaveBeenCalledOnce();
    await expect(args.onSubmit).toHaveBeenCalledWith("October collections");
    await expect(
      canvas.getByRole("button", { name: "Create deck" })
    ).toHaveAttribute("aria-busy", "true");

    await userEvent.keyboard("{Enter}");
    await userEvent.click(canvas.getByRole("button", { name: "Create deck" }));
    await expect(args.onSubmit).toHaveBeenCalledOnce();
  },
};

// Bug caught: Cancel during the create closes the composer, yet the new deck still opens.
export const CancelWaitsForTheDeck: Story = {
  play: async ({ args, canvas }) => {
    const cancel = canvas.getByRole("button", { name: "Cancel" });

    await expect(cancel).toBeEnabled();

    await userEvent.type(textbox(canvas), "October collections{Enter}");

    await expect(args.onSubmit).toHaveBeenCalledOnce();
    await expect(cancel).toBeDisabled();
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};

// Bug caught: Shift and Enter creates the deck instead of starting a new line.
export const ShiftEnterIsANewLine: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.type(
      textbox(canvas),
      "Board update{Shift>}{Enter}{/Shift}Five slides"
    );

    await expect(textbox(canvas)).toHaveValue("Board update\nFive slides");
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

// Bug caught: a blank description starts a run the server refuses.
export const BlankDoesNothing: Story = {
  play: async ({ args, canvas }) => {
    const create = canvas.getByRole("button", { name: "Create deck" });

    await userEvent.type(textbox(canvas), "   {Enter}");
    await expect(create).toBeDisabled();

    // A disabled button takes no pointer, so the check is skipped to prove the handler stays silent.
    await userEvent.click(create, { pointerEventsCheck: 0 });
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

// Bug caught: a starter sends at once, or leaves focus on the chip so typing goes nowhere.
export const ChipFills: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Make a deck of this month's figures",
      })
    );

    await expect(textbox(canvas)).toHaveValue(
      "Make a deck of this month's figures"
    );
    await expect(textbox(canvas)).toHaveFocus();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

// Bug caught: a refusal is silent, or it clears what the person wrote.
export const RunActive: Story = {
  name: "Run active",
  render: (args) => <Page {...args} refuse />,
  play: async ({ canvas }) => {
    await userEvent.type(textbox(canvas), "Board update{Enter}");

    await expect(canvas.getByRole("alert")).toHaveTextContent(REFUSAL);
    await expect(textbox(canvas)).toHaveValue("Board update");
  },
};

// Bug caught: on a phone the two buttons stay small at the end of the row.
export const Phone: Story = {
  name: "On a phone",
  globals: phone,
  play: async ({ canvas }) => {
    const box = textbox(canvas).getBoundingClientRect();

    const cancel = canvas
      .getByRole("button", { name: "Cancel" })
      .getBoundingClientRect();

    const create = canvas
      .getByRole("button", { name: "Create deck" })
      .getBoundingClientRect();

    await expect(Math.round(cancel.left)).toBe(Math.round(box.left));
    await expect(Math.round(create.right)).toBe(Math.round(box.right));
  },
};

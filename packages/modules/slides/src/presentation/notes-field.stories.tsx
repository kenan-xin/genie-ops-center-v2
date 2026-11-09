import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";

import { textWithChartSlide } from "./__fixtures__/decks.ts";
import { NotesField, type NotesFieldProps } from "./notes-field.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const WAIT = 50;

const HELP =
  "Only you see these, in the presenter window. They go into the PowerPoint export.";

const CAP = "Notes hold at most 2,000 characters.";

const save = fn<NotesFieldProps["onSaveNotes"]>();

const withNotes = { ...textWithChartSlide, notes: "Open with the headline." };

/** A save the story answers by hand, to hold it in flight. */
function heldSave() {
  let answer: (() => void) | undefined;

  save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        answer = resolve;
      })
  );

  return () => answer?.();
}

/**
 * The deck page around the field: a save echoes into `slide.notes`, as the query cache does,
 * Undo puts other notes there, and Close unmounts the field, as a slide switch does.
 */
function Page(props: NotesFieldProps) {
  const [notes, setNotes] = useState(props.slide.notes);
  const [open, setOpen] = useState(true);

  return (
    <div className="grid max-w-2xl gap-4 p-4">
      {open ? (
        <NotesField
          {...props}
          slide={{ ...props.slide, notes }}
          onSaveNotes={async (slideId, value) => {
            await props.onSaveNotes(slideId, value);
            setNotes(value ?? undefined);
          }}
        />
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={() => setNotes("Earlier notes.")}>
          Undo
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </div>
  );
}

const meta = {
  title: "Modules/Slides/Notes field",
  component: NotesField,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The speaker notes of one slide (S7-45, presenter window prototype variant A): under the slide from 768 px and under Title in the Edit slide sheet. Each pause saves one `change-slide-fields` step, so each is one Undo entry; saves run one at a time, a pending save still goes when the field closes, and a value from outside (Undo, the agent, another tab) shows only when it differs from the field's own last save. The field holds 2,000 characters.",
      },
    },
    a11y: { test: "error" },
  },
  args: { slide: textWithChartSlide, onSaveNotes: save, waitMs: WAIT },
  render: (args) => <Page {...args} />,
  globals: desktop,
  beforeEach: () => {
    save.mockReset().mockResolvedValue(undefined);
  },
} satisfies Meta<typeof NotesField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SavesAfterPause: Story = {
  name: "Saves after a pause",
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Speaker notes" });

    await expect(field).toHaveAccessibleDescription(
      expect.stringContaining(HELP)
    );
    await userEvent.type(field, "Say hello.");

    await expect(await canvas.findByText("Saved")).toBeVisible();
    // One step per pause, not per key.
    await expect(save).toHaveBeenCalledOnce();
    await expect(save).toHaveBeenCalledWith("s2", "Say hello.");
    await expect(canvas.getByText("10 / 2,000")).toBeVisible();
  },
};

export const SavesOneAtATime: Story = {
  name: "Saves one at a time",
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Speaker notes" });
    const answerFirst = heldSave();

    await userEvent.type(field, "One.");
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await userEvent.type(field, " Two.");
    // The second pause has passed, but its save waits for the first one's answer and hash.
    await new Promise((resolve) => setTimeout(resolve, WAIT * 4));
    await expect(save).toHaveBeenCalledOnce();

    answerFirst();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await expect(save).toHaveBeenLastCalledWith("s2", "One. Two.");
  },
};

export const ClearingSendsNull: Story = {
  name: "Clearing sends null",
  args: { slide: withNotes },
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Speaker notes" });

    await expect(field).toHaveValue("Open with the headline.");
    await userEvent.clear(field);
    // Spaces alone are no notes: the schema refuses a blank note.
    await userEvent.type(field, "   ");

    await waitFor(() => expect(save).toHaveBeenCalledWith("s2", null));
    await expect(save).toHaveBeenCalledOnce();
  },
};

export const StopsAtCap: Story = {
  name: "Stops at the cap",
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Speaker notes" });

    await userEvent.click(field);
    await userEvent.paste("a".repeat(2050));

    await expect(field).toHaveValue("a".repeat(2000));
    await expect(canvas.getByText(CAP)).toBeVisible();
    await expect(canvas.getByText("2,000 / 2,000")).toBeVisible();
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("s2", "a".repeat(2000))
    );
  },
};

export const ServerValueAfterUndo: Story = {
  name: "Server value after Undo",
  args: { slide: withNotes },
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Speaker notes" });

    // An outside change with no save pending shows in the field.
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    await expect(field).toHaveValue("Earlier notes.");

    // The save's own answer echoes while the person types on: the typed text stays.
    const answerFirst = heldSave();

    await userEvent.type(field, " One.");
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await userEvent.type(field, " Two.");
    answerFirst();

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await expect(field).toHaveValue("Earlier notes. One. Two.");
    await expect(save).toHaveBeenLastCalledWith(
      "s2",
      "Earlier notes. One. Two."
    );
  },
};

export const SavesOnUnmount: Story = {
  name: "Saves on unmount",
  args: { waitMs: 5000 },
  play: async ({ canvas }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Speaker notes" }),
      "Typed then closed."
    );
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("s2", "Typed then closed.")
    );
  },
};

export const RefusedSave: Story = {
  name: "Refused save",
  beforeEach: () => {
    save
      .mockReset()
      .mockRejectedValue(
        new Error(
          "This deck changed since you opened it. Reload it to see the latest version."
        )
      );
  },
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Speaker notes" });

    await userEvent.type(field, "Keep this.");

    const refusal = await canvas.findByText(/The notes were not saved\./);

    await expect(refusal).toBeVisible();
    await expect(field).toHaveValue("Keep this.");
    await expect(field).toHaveAccessibleDescription(
      expect.stringContaining("The notes were not saved.")
    );
    await expect(field).toBeInvalid();
    await expect(canvas.queryByText("Saved")).toBeNull();
  },
};

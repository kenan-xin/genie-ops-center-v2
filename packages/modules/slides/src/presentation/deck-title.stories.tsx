import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fireEvent, fn, userEvent } from "storybook/test";

import { DeckTitle } from "./deck-title.tsx";

const TITLE = "October collections update";

/** The refusal's Reload in the `failure` stories. */
const reload = fn();

type Props = Parameters<typeof DeckTitle>[0];

/** The page's part: it opens and closes the input, and a save sets `saving`. */
function Page(props: Props) {
  const [editing, setEditing] = useState(props.editing);
  const [saving, setSaving] = useState(props.saving);

  return (
    <DeckTitle
      {...props}
      editing={editing}
      saving={saving}
      onEditingChange={(next) => {
        props.onEditingChange(next);
        setEditing(next);
      }}
      onSave={(title) => {
        props.onSave(title);
        setSaving(true);
      }}
    />
  );
}

const meta = {
  title: "Modules/Slides/Deck title",
  component: DeckTitle,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The deck page's title, renamed in place (S7-48, new deck flow step 3). The title is the page's one heading; a person who may edit the deck clicks it to get a text box with the title selected. Enter saves, Escape cancels. While the agent drafts, the title is plain text, because the agent may still rename the deck.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    title: TITLE,
    editable: true,
    editing: false,
    saving: false,
    failure: null,
    onEditingChange: fn(),
    onSave: fn(),
  },
  render: (args) => <Page {...args} />,
  globals: { viewport: { value: "desktop1440", isRotated: false } },
} satisfies Meta<typeof DeckTitle>;

export default meta;

type Story = StoryObj<typeof meta>;

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

const renameButton = (canvas: Canvas, title = TITLE) =>
  canvas.getByRole("button", { name: `Rename deck, ${title}` });

async function open(canvas: Canvas) {
  await userEvent.click(renameButton(canvas));

  const input = canvas.getByRole("textbox", { name: "Deck title" });

  await expect(input).toHaveFocus();

  return input;
}

// Bug caught: the title is sent untrimmed, or a second Enter sends a second rename.
export const EnterSaves: Story = {
  play: async ({ args, canvas }) => {
    const input = await open(canvas);

    await expect(input).toHaveValue(TITLE);
    // The whole title is selected, so typing replaces it.
    await userEvent.keyboard("  Collections review  {Enter}");
    await userEvent.keyboard("{Enter}");

    await expect(args.onSave).toHaveBeenCalledOnce();
    await expect(args.onSave).toHaveBeenCalledWith("Collections review");
    // The heading stays the page's one h1 while the person types.
    await expect(canvas.getByRole("heading", { level: 1 })).toContainElement(
      input
    );
  },
};

// Bug caught: Escape saves, keeps the typed text, or drops keyboard focus on the page.
export const EscapeCancels: Story = {
  play: async ({ args, canvas }) => {
    await open(canvas);
    await userEvent.keyboard("Something else{Escape}");

    await expect(renameButton(canvas)).toHaveFocus();
    await expect(args.onSave).not.toHaveBeenCalled();

    await userEvent.click(renameButton(canvas));
    await expect(
      canvas.getByRole("textbox", { name: "Deck title" })
    ).toHaveValue(TITLE);
  },
};

// Bug caught: a title over the server's 80 characters is sent, or one of exactly 80 is refused.
export const TooLong: Story = {
  name: "Too long",
  play: async ({ args, canvas }) => {
    const input = await open(canvas);

    await userEvent.clear(input);
    await userEvent.paste("a".repeat(81));

    await expect(
      canvas.getByText("A deck title holds at most 80 characters.")
    ).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");

    await userEvent.keyboard("{Enter}");
    await expect(args.onSave).not.toHaveBeenCalled();

    await userEvent.keyboard("{Backspace}{Enter}");
    await expect(args.onSave).toHaveBeenCalledWith("a".repeat(80));
  },
};

// Bug caught: an unchanged title spends a save and an Undo entry, or leaves the input open.
export const Unchanged: Story = {
  play: async ({ args, canvas }) => {
    await open(canvas);
    await userEvent.keyboard("{Enter}");

    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(renameButton(canvas)).toHaveFocus();
  },
};

// Bug caught: a phone has no Escape, so leaving the input must save; a second blur saves twice.
export const BlurSaves: Story = {
  name: "Blur saves",
  play: async ({ args, canvas, canvasElement }) => {
    await open(canvas);
    await userEvent.keyboard(" Collections review ");
    await userEvent.click(canvasElement);
    await userEvent.tab();

    await expect(args.onSave).toHaveBeenCalledOnce();
    await expect(args.onSave).toHaveBeenCalledWith("Collections review");
  },
};

// Bug caught: a tap on Reload blurs the input and resends the save the server just refused.
export const BlurIntoReloadDoesNotSave: Story = {
  name: "Blur into Reload does not save",
  args: {
    editing: true,
    failure: (
      <div role="alert">
        <p>This deck changed since you opened it.</p>
        <button type="button" onClick={reload}>
          Reload
        </button>
      </div>
    ),
  },
  beforeEach: () => {
    reload.mockClear();
  },
  play: async ({ args, canvas }) => {
    await userEvent.keyboard("Collections review");

    const input = canvas.getByRole("textbox", { name: "Deck title" });
    const button = canvas.getByRole("button", { name: "Reload" });

    // Safari and iOS: the press does not focus Reload, so the blur names no target.
    fireEvent.pointerDown(button);
    fireEvent.focusOut(input, { relatedTarget: null });
    fireEvent.click(button);

    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(reload).toHaveBeenCalledOnce();
    await expect(input).toHaveValue("Collections review");

    // Chromium: the click focuses Reload, and the blur names it.
    await userEvent.click(input);
    await userEvent.click(button);
    await expect(args.onSave).not.toHaveBeenCalled();

    // The press is spent: a later blur elsewhere still saves.
    await userEvent.click(input);
    await userEvent.tab({ shift: true });
    await expect(args.onSave).toHaveBeenCalledWith("Collections review");
  },
};

// Bug caught: a rename while the run builds moves the hash and the agent's own rename is refused.
export const WhileDrafting: Story = {
  name: "While drafting",
  args: { editable: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: TITLE })
    ).toBeVisible();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

// Bug caught: a refused save closes the input and loses the typed title.
export const Refused: Story = {
  args: {
    editing: true,
    failure: <p role="alert">This deck changed since you opened it.</p>,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("textbox", { name: "Deck title" })
    ).toBeVisible();
    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};

// Bug caught: on a phone the pencil only shows on hover, so a touch screen gives no hint.
export const OnPhone: Story = {
  name: "On a phone",
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    const button = renameButton(canvas);

    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44
    );
    await expect(button.querySelector("svg")).toBeVisible();
  },
};

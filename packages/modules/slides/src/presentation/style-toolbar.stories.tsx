import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import {
  bulletsWithTwoVisualsSlide,
  textWithChartSlide,
} from "./__fixtures__/decks.ts";
import { SlideEditorBar, StyleToolbar } from "./style-toolbar.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const [title, text, chart] = textWithChartSlide.elements;

const meta = {
  title: "Modules/Slides/Style toolbar",
  component: StyleToolbar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The style controls of the selected slide element, variant A of the slide editor controls prototype (S7-43). A title, text or bullet list takes text color, font size, weight, alignment, fill, border and Position; a figure, chart, table or image takes fill, border and Position. Each control sends one `change-element` step. Position opens the nudge pad and the width and height steppers in a popover. Below 768 px the toolbar is a dock of one row of tools (Text, Fill, Border, Position, More) at the bottom of the screen, each opening a card above it.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    element: title!,
    slideId: textWithChartSlide.id,
    index: 0,
    box: { x: 40, y: 32, w: 880, h: 88 },
    onStep: fn(),
    onEditText: fn(),
  },
  decorators: [
    (Story) => (
      <div className="min-h-96 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StyleToolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

// A swatch is one step that sets only the text color of the title.
export const TextColor: Story = {
  name: "A swatch sets the title's text color",
  globals: desktop,
  play: async ({ args, canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Text color" }));

    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await body.findByRole("button", { name: "White #FFFFFF" })
    );
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 0,
      style: { color: "#FFFFFF" },
    });
  },
};

// A hex the schema refuses names the format and sends nothing.
export const BadHex: Story = {
  name: "A wrong hex shows the format and sends nothing",
  globals: desktop,
  args: { element: text!, index: 1 },
  play: async ({ args, canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Fill" }));

    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(
      await body.findByRole("textbox", { name: "Hex" }),
      "blue{Enter}"
    );
    await expect(
      await body.findByText("Enter a 6-digit hex color, for example #1E3A8A.", {
        selector: "[data-slot=field-error], [role=alert], p",
      })
    ).toBeVisible();
    await expect(args.onStep).not.toHaveBeenCalled();
  },
};

// A chart takes only fill, border and Position: a text control would be refused by the save.
export const ChartControls: Story = {
  name: "A chart shows only fill, border and Position",
  globals: desktop,
  args: { element: chart!, index: 2, box: { x: 384, y: 136, w: 536, h: 348 } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("toolbar", { name: "Chart style" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Text color" })
    ).toBeNull();
    await expect(
      canvas.queryByRole("combobox", { name: "Font size" })
    ).toBeNull();
    await expect(canvas.getByRole("button", { name: "Fill" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Position/ })
    ).toBeVisible();
  },
};

/** The dock's tools in order, after it checks one row of 52 by 60 px targets at the bottom. */
async function dockTools(canvasElement: HTMLElement, name: string) {
  const toolbar = within(canvasElement).getByRole("toolbar", { name });
  const tools = within(toolbar).getAllByRole("button");
  const rects = tools.map((tool) => tool.getBoundingClientRect());
  const { innerWidth, innerHeight } = canvasElement.ownerDocument.defaultView!;

  const gap = innerHeight - toolbar.getBoundingClientRect().bottom;

  // Docked: the toolbar sits in its bar at the screen's bottom edge, inside the bar's 8 px padding.
  await expect(gap).toBeGreaterThanOrEqual(0);
  await expect(gap).toBeLessThanOrEqual(8);
  await expect(new Set(rects.map(({ top }) => Math.round(top))).size).toBe(1);

  for (const rect of rects) {
    expect(rect.height).toBeGreaterThanOrEqual(52);
    expect(rect.width).toBeGreaterThanOrEqual(60);
    expect(rect.right).toBeLessThanOrEqual(innerWidth);
  }

  return tools.map((tool) => tool.textContent?.trim());
}

/** Taps a dock tool and answers its card, the dialog named after the tool. */
async function openTool(canvasElement: HTMLElement, tool: string) {
  await userEvent.click(
    within(within(canvasElement).getByRole("toolbar")).getByRole("button", {
      name: tool,
    })
  );

  return within(canvasElement.ownerDocument.body).findByRole("dialog", {
    name: tool,
  });
}

// P13-10 and czjw.156: one row of five labelled tools at the bottom, never a wrap over the page.
export const PhoneDock: Story = {
  name: "On a phone the title's dock is one row of five tools",
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await expect(await dockTools(canvasElement, "Title style")).toEqual([
      "Text",
      "Fill",
      "Border",
      "Position",
      "More",
    ]);

    // One tab stop: the arrow keys move between the tools (P16e-7).
    const toolbar = within(
      canvas.getByRole("toolbar", { name: "Title style" })
    );

    toolbar.getByRole("button", { name: "Text" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(toolbar.getByRole("button", { name: "Fill" })).toHaveFocus();
  },
};

// A chart takes no text style, so its dock has no Text tool.
export const PhoneDockChart: Story = {
  name: "On a phone the chart's dock has no Text tool",
  globals: phone,
  args: { element: chart!, index: 2, box: { x: 384, y: 136, w: 536, h: 348 } },
  play: async ({ canvasElement }) => {
    await expect(await dockTools(canvasElement, "Chart style")).toEqual([
      "Fill",
      "Border",
      "Position",
      "More",
    ]);
  },
};

// Review Focus 4: the card floats above the dock, a pick keeps it open, and Escape returns to Text.
export const PhoneTextCard: Story = {
  name: "On a phone Text opens a card above the dock",
  globals: phone,
  play: async ({ args, canvas, canvasElement }) => {
    const toolbar = canvas.getByRole("toolbar", { name: "Title style" });
    const dialog = await openTool(canvasElement, "Text");
    const card = within(dialog);

    await waitFor(() =>
      expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        toolbar.getBoundingClientRect().top
      )
    );

    await userEvent.click(card.getByRole("button", { name: "White #FFFFFF" }));
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 0,
      style: { color: "#FFFFFF" },
    });
    // A pick keeps the card open; a closing card keeps its node for the exit, so read its state.
    await expect(dialog).toHaveAttribute("data-open");

    // A size pick, through its own popup inside the card, keeps the card open too.
    await userEvent.click(card.getByRole("combobox", { name: "Font size" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "32",
      })
    );
    await expect(args.onStep).toHaveBeenLastCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 0,
      style: { fontSize: 32 },
    });
    await expect(dialog).toHaveAttribute("data-open");

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("dialog")
      ).toBeNull()
    );
    await expect(
      within(toolbar).getByRole("button", { name: "Text" })
    ).toHaveFocus();
  },
};

// The segmented border values map to the desktop menu's steps.
export const PhoneBorderCard: Story = {
  name: "On a phone the Border card's 2 px sets a 2 px border",
  globals: phone,
  play: async ({ args, canvasElement }) => {
    const card = within(await openTool(canvasElement, "Border"));

    await userEvent.click(card.getByRole("button", { name: "2 px" }));
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 0,
      style: { border: { color: "#111827", width: 2 } },
    });
  },
};

// The Position card replaces the old bottom sheet: Move right is one box step.
export const PhonePositionCard: Story = {
  name: "On a phone the Position card's Move right is one step",
  globals: phone,
  args: { element: text!, index: 1, box: { x: 40, y: 136, w: 320, h: 348 } },
  play: async ({ args, canvasElement }) => {
    const card = within(await openTool(canvasElement, "Position"));

    await userEvent.click(card.getByRole("button", { name: "Move right" }));
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 48, y: 136, w: 320, h: 348 },
    });
  },
};

// More holds the row's last actions; a title cannot go, because the save refuses a slide without it.
export const PhoneMoreCard: Story = {
  name: "On a phone More holds Edit text, Use theme style and a disabled Delete",
  globals: phone,
  args: { element: { ...title!, style: { color: "#FFFFFF" } } },
  play: async ({ args, canvasElement }) => {
    let card = within(await openTool(canvasElement, "More"));

    await expect(
      card.getByRole("button", { name: "Delete element" })
    ).toBeDisabled();
    await userEvent.click(
      card.getByRole("button", { name: "Use theme style" })
    );
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 0,
      style: null,
    });

    const body = within(canvasElement.ownerDocument.body);

    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());

    card = within(await openTool(canvasElement, "More"));
    await userEvent.click(card.getByRole("button", { name: "Edit text" }));
    await expect(args.onEditText).toHaveBeenCalledOnce();
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
  },
};

// A chart has no text to edit, and its Delete calls the page.
export const PhoneMoreCardChart: Story = {
  name: "On a phone a chart's More deletes it",
  globals: phone,
  args: {
    element: chart!,
    index: 2,
    box: { x: 384, y: 136, w: 536, h: 348 },
    onDelete: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const card = within(await openTool(canvasElement, "More"));

    await expect(card.queryByRole("button", { name: "Edit text" })).toBeNull();
    await userEvent.click(card.getByRole("button", { name: "Delete element" }));
    await expect(args.onDelete).toHaveBeenCalledOnce();
  },
};

// The desktop popover holds its own PositionControl wiring; PhonePositionCard covers the card.
export const PositionPopover: Story = {
  name: "On a desktop Position opens a popover, and Move right is one step",
  globals: desktop,
  args: { element: text!, index: 1, box: { x: 40, y: 136, w: 320, h: 348 } },
  play: async ({ args, canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Position/ }));

    const popover = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Position and size",
      })
    );

    await userEvent.click(popover.getByRole("button", { name: "Move right" }));
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 48, y: 136, w: 320, h: 348 },
    });
  },
};

// P13-9: a dark fill on a text with the theme color turns it white in the same step, so the hand
// edit reaches what the save allows.
export const FillAdjustsText: Story = {
  name: "A dark fill turns the text white in the same step",
  globals: desktop,
  args: { element: text!, index: 1, box: { x: 40, y: 136, w: 320, h: 348 } },
  play: async ({ args, canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Fill" }));

    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await body.findByRole("button", { name: "Dark blue #1E3A8A" })
    );
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      style: { fill: "#1E3A8A", color: "#FFFFFF" },
    });
    // The pick closes the popover; axe runs once its focus guards are gone, not during the exit.
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
  },
};

// P13-9: a dark background turns each text without a fill white in the same change, so the hand
// edit reaches what the save allows; one change, one Undo entry.
export const BackgroundAdjustsText: StoryObj<typeof SlideEditorBar> = {
  name: "A dark background turns the texts without a fill white in one change",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: { slide: textWithChartSlide, onSteps: fn(), onAdd: fn() },
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Background" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Dark blue #1E3A8A" })
    );
    await expect(args.onSteps).toHaveBeenCalledTimes(1);
    await expect(args.onSteps).toHaveBeenCalledWith([
      {
        op: "change-slide-fields",
        slideId: textWithChartSlide.id,
        background: "#1E3A8A",
      },
      {
        op: "change-element",
        slideId: textWithChartSlide.id,
        index: 0,
        style: { color: "#FFFFFF" },
      },
      {
        op: "change-element",
        slideId: textWithChartSlide.id,
        index: 1,
        style: { color: "#FFFFFF" },
      },
    ]);
  },
};

export const EditorBar: StoryObj<typeof SlideEditorBar> = {
  name: "Add element and Background",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: { slide: bulletsWithTwoVisualsSlide, onSteps: fn(), onAdd: fn() },
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    // The slide has bullets and two visuals: no second body, no third visual.
    await userEvent.click(canvas.getByRole("button", { name: "Add element" }));
    await expect(
      await body.findByRole("menuitem", { name: "Text" })
    ).toHaveAttribute("aria-disabled", "true");
    await expect(body.getByRole("menuitem", { name: "Image" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await userEvent.keyboard("{Escape}");

    await userEvent.click(canvas.getByRole("button", { name: "Background" }));
    await userEvent.click(
      await body.findByRole("button", { name: "No background" })
    );
    await expect(args.onSteps).toHaveBeenCalledTimes(1);
    await expect(args.onSteps).toHaveBeenCalledWith([
      {
        op: "change-slide-fields",
        slideId: bulletsWithTwoVisualsSlide.id,
        background: null,
      },
    ]);
  },
};

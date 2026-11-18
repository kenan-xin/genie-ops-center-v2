import { controlHeightsPx, touchAreaPx } from "@genie/ui/tokens";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { SLIDE_RULE_MESSAGES } from "../contract.ts";
import {
  bulletsWithTwoVisualsSlide,
  textWithChartSlide,
} from "./__fixtures__/decks.ts";
import { BLUE_THEME } from "./__fixtures__/themes.ts";
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
          "The style controls of the selected slide element, variant A of the slide editor controls prototype (S7-43). A title, text or bullet list takes text color, font size, weight, alignment, fill, border and Position; a figure, chart, table or image takes fill, border and Position. Each control sends one `change-element` step. Position opens the nudge pad and the width and height steppers in a popover. Below 768 px the toolbar is a dock of one row of tools (Text, Fill, Border, Position, More) at the bottom of the screen, under a row with the element's name and Done. Each tool opens a card above it, and More opens a sheet of the element's actions.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    element: title!,
    slideId: textWithChartSlide.id,
    index: 0,
    box: { x: 40, y: 32, w: 880, h: 88 },
    slide: textWithChartSlide,
    theme: BLUE_THEME,
    first: false,
    onStep: fn(),
    onEditText: fn(),
    onDone: fn(),
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

/** Each control's height and top edge, rounded to the 0.1 px a layout can drift by. */
function boxes(controls: readonly Element[]) {
  return controls.map((control) => {
    const { height, top } = control.getBoundingClientRect();

    return {
      name: control.getAttribute("aria-label") ?? control.textContent?.trim(),
      height: Math.round(height * 10) / 10,
      top: Math.round(top * 10) / 10,
    };
  });
}

// C06-1: a toolbar is a dense place, so every control of the row is 32 px on one top edge.
export const DenseRow: Story = {
  name: "On a desktop every control of the toolbar is 32 px on one top edge",
  globals: desktop,
  play: async ({ canvas }) => {
    const toolbar = canvas.getByRole("toolbar", { name: "Title style" });

    // The segmented tracks, not their segments, take the row's sm height (6wz1.105).
    const rows = boxes([
      ...toolbar.querySelectorAll('[data-slot="toggle-group"]'),
      ...[...toolbar.querySelectorAll("button")].filter(
        (button) => button.closest('[data-slot="toggle-group"]') === null
      ),
    ]);

    await expect(rows).toHaveLength(9);
    await expect(rows.filter(({ height }) => height !== 32)).toEqual([]);
    await expect(new Set(rows.map(({ top }) => top)).size).toBe(1);
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

// P13-10, P13-17 and czjw.156: the element's name and Done sit above one row of five labelled
// tools at the bottom, never a wrap over the page.
export const PhoneDock: Story = {
  name: "On a phone the title's dock names it with Done above five tools",
  globals: phone,
  play: async ({ args, canvas, canvasElement }) => {
    await expect(await dockTools(canvasElement, "Title style")).toEqual([
      "Text",
      "Fill",
      "Border",
      "Position",
      "More",
    ]);

    const toolbar = canvas.getByRole("toolbar", { name: "Title style" });
    const done = canvas.getByRole("button", { name: "Done" });
    const row = done.parentElement!;

    // The name row sits above the tools, with the element's name beside Done.
    await expect(row).toHaveTextContent(/^TitleDone$/);
    await expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      toolbar.getBoundingClientRect().top
    );
    // C13-2: Done's 44 px touch area stays inside its row, clear of the tools.
    await expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      touchAreaPx
    );
    await userEvent.click(done);
    await expect(args.onDone).toHaveBeenCalledOnce();

    // One tab stop: the arrow keys move between the tools (P16e-7).
    const tools = within(toolbar);

    tools.getByRole("button", { name: "Text" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(tools.getByRole("button", { name: "Fill" })).toHaveFocus();
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
    const nameRow = canvas.getByRole("button", { name: "Done" }).parentElement!;
    const dialog = await openTool(canvasElement, "Text");
    const card = within(dialog);

    // C13-1: the card sits above the element's name and Done, which stay in view.
    await waitFor(() =>
      expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        nameRow.getBoundingClientRect().top
      )
    );
    // C13-3: a swatch is a phone control's 40 px.
    await expect(
      card
        .getByRole("button", { name: "White #FFFFFF" })
        .getBoundingClientRect().height
    ).toBe(controlHeightsPx.md.phone);

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

// C06-1: the Text card's size, weight and alignment share one line on a phone wider than 390 px.
export const PhoneTextCardRow: Story = {
  name: "On a phone the Text card's size, weight and alignment are all 32 px",
  globals: phone,
  play: async ({ canvasElement }) => {
    const card = within(await openTool(canvasElement, "Text"));

    const rows = boxes([
      card.getByRole("combobox", { name: "Font size" }),
      card.getByRole("combobox", { name: "Weight" }),
      card.getByRole("group", { name: "Alignment" }),
    ]);

    await expect(rows.filter(({ height }) => height !== 32)).toEqual([]);
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
    // Review Focus 1: the border widths fit the 390 px page.
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
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

/** Taps the dock's More and answers its sheet, "<name> actions". */
async function openMore(canvasElement: HTMLElement, name: string) {
  await userEvent.click(
    within(within(canvasElement).getByRole("toolbar")).getByRole("button", {
      name: "More",
    })
  );

  return within(
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: `${name} actions`,
    })
  );
}

// P13-17 and P13-18: More opens the element's sheet; a title cannot go, because the save refuses
// a slide without it.
export const PhoneMoreCard: Story = {
  name: "On a phone More opens the element's sheet",
  globals: phone,
  args: { element: { ...title!, style: { color: "#FFFFFF" } } },
  play: async ({ args, canvas, canvasElement }) => {
    let sheet = await openMore(canvasElement, "Title");

    await expect(
      sheet.getAllByRole("button").map((row) => row.textContent)
    ).toEqual(["Edit text", "Use theme style", "Delete element"]);
    await expect(
      sheet.getByRole("button", { name: "Delete element" })
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      sheet.getByRole("button", { name: "Use theme style" })
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
    // Use theme style moves no focus itself, so the sheet hands it back to More.
    await expect(canvas.getByRole("button", { name: "More" })).toHaveFocus();

    sheet = await openMore(canvasElement, "Title");
    await userEvent.click(sheet.getByRole("button", { name: "Edit text" }));
    await waitFor(() => expect(args.onEditText).toHaveBeenCalledOnce());
    await expect(body.queryByRole("dialog")).toBeNull();
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
    const sheet = await openMore(canvasElement, "Chart");

    await expect(sheet.queryByRole("button", { name: "Edit text" })).toBeNull();
    await userEvent.click(
      sheet.getByRole("button", { name: "Delete element" })
    );
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

// P13-9, P14-33: a light fill on panel text whose white was picked by hand turns it ink in the same
// step, so the hand edit reaches what the save allows. A text in its default color needs no step:
// it draws ink on a light fill by itself (P14-7).
const whiteText = { ...text!, style: { color: "#FFFFFF" } };

export const FillAdjustsText: Story = {
  name: "A light fill turns the panel text ink in the same step",
  globals: desktop,
  args: {
    element: whiteText,
    slide: { ...textWithChartSlide, elements: [title!, whiteText, chart!] },
    index: 1,
    box: { x: 43, y: 265, w: 298, h: 217 },
  },
  play: async ({ args, canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Fill" }));

    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await body.findByRole("button", { name: "Light gray #F3F4F6" })
    );
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      style: { fill: "#F3F4F6", color: "#111827" },
    });
    // The pick closes the popover; axe runs once its focus guards are gone, not during the exit.
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
  },
};

// P14-15, P14-33: on the title slide a background replaces the panel, so a light pick turns its
// white title and text ink in one change; one change, one Undo entry.
export const BackgroundAdjustsText: StoryObj<typeof SlideEditorBar> = {
  name: "A light background on the title slide turns its texts ink in one change",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: {
    slide: { id: textWithChartSlide.id, elements: [title!, text!] },
    theme: BLUE_THEME,
    first: true,
    ask: "on",
    onSteps: fn(),
    onAdd: fn(),
    onAsk: fn(),
  },
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Background" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Light gray #F3F4F6" })
    );
    await expect(args.onSteps).toHaveBeenCalledTimes(1);
    await expect(args.onSteps).toHaveBeenCalledWith([
      {
        op: "change-slide-fields",
        slideId: textWithChartSlide.id,
        background: "#F3F4F6",
      },
      {
        op: "change-element",
        slideId: textWithChartSlide.id,
        index: 0,
        style: { color: "#111827" },
      },
      {
        op: "change-element",
        slideId: textWithChartSlide.id,
        index: 1,
        style: { color: "#111827" },
      },
    ]);
  },
};

export const EditorBar: StoryObj<typeof SlideEditorBar> = {
  name: "Add element and Background",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: {
    slide: bulletsWithTwoVisualsSlide,
    theme: BLUE_THEME,
    first: false,
    ask: "on",
    onSteps: fn(),
    onAdd: fn(),
    onAsk: fn(),
  },
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    // The slide has bullets and two visuals: no second body, no third visual.
    await userEvent.click(canvas.getByRole("button", { name: "Add element" }));
    await expect(await menuItems()).toEqual([
      ["Text", SLIDE_RULE_MESSAGES.body],
      ["Bullets", SLIDE_RULE_MESSAGES.body],
      ["Figure", SLIDE_RULE_MESSAGES.visual],
      ["Chart", SLIDE_RULE_MESSAGES.visual],
      ["Table", SLIDE_RULE_MESSAGES.visual],
      ["Image", SLIDE_RULE_MESSAGES.visual],
    ]);
    await expect(
      screen.getAllByText(
        "This slide is full. Remove an element or add a new slide."
      )
    ).toHaveLength(1);
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

// T10-b: a slide with a text and one visual still takes a figure, chart or image, so those stay on
// and no full line shows; the kinds it refuses carry the rule they break.
export const EditorBarOnlyImage: StoryObj<typeof SlideEditorBar> = {
  name: "Add element offers the visuals where only a visual fits",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: {
    slide: textWithChartSlide,
    theme: BLUE_THEME,
    first: false,
    ask: "on",
    onSteps: fn(),
    onAdd: fn(),
    onAsk: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add element" }));
    await expect(await menuItems()).toEqual([
      ["Text", SLIDE_RULE_MESSAGES.body],
      ["Bullets", SLIDE_RULE_MESSAGES.body],
      ["Figure", "on"],
      ["Chart", "on"],
      ["Table", SLIDE_RULE_MESSAGES.table],
      ["Image", "on"],
    ]);
    await expect(
      screen.queryByText(
        "This slide is full. Remove an element or add a new slide."
      )
    ).toBeNull();
  },
};

/** A slide with its title and one text: every visual kind fits. */
const titleAndTextSlide = {
  id: textWithChartSlide.id,
  elements: [title!, text!],
};

/**
 * The items of the open Add element menu, in order: each label with the reason it is off, or "on".
 */
async function menuItems() {
  const menu = await screen.findByRole("menu");

  return within(menu)
    .getAllByRole("menuitem")
    .map((item) => [
      item.firstChild?.textContent,
      item.getAttribute("aria-disabled") === "true"
        ? document.getElementById(item.getAttribute("aria-describedby") ?? "")
            ?.textContent
        : "on",
    ]);
}

// czjw.189: Figure, Chart and Table ask Ask for the shown slide; the bar adds none of them by hand.
export const AddElementAsksForCharts: StoryObj<typeof SlideEditorBar> = {
  name: "Add element sends Chart to Ask",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: {
    slide: titleAndTextSlide,
    theme: BLUE_THEME,
    first: false,
    ask: "on",
    onSteps: fn(),
    onAdd: fn(),
    onAsk: fn(),
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add element" }));
    await expect(await menuItems()).toEqual([
      ["Text", SLIDE_RULE_MESSAGES.body],
      ["Bullets", SLIDE_RULE_MESSAGES.body],
      ["Figure", "on"],
      ["Chart", "on"],
      ["Table", "on"],
      ["Image", "on"],
    ]);

    await userEvent.click(screen.getByRole("menuitem", { name: "Chart" }));
    await expect(args.onAsk).toHaveBeenCalledTimes(1);
    await expect(args.onAsk).toHaveBeenCalledWith("chart");
    await expect(args.onAdd).not.toHaveBeenCalled();
  },
};

// czjw.189: with AI off no panel would send the question, so the Ask kinds say why they are off.
export const AddElementWhenAIIsOff: StoryObj<typeof SlideEditorBar> = {
  name: "Add element with AI off",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: {
    slide: titleAndTextSlide,
    theme: BLUE_THEME,
    first: false,
    ask: "off",
    onSteps: fn(),
    onAdd: fn(),
    onAsk: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add element" }));
    await expect(await menuItems()).toEqual([
      ["Text", SLIDE_RULE_MESSAGES.body],
      ["Bullets", SLIDE_RULE_MESSAGES.body],
      ["Figure", "AI is off."],
      ["Chart", "AI is off."],
      ["Table", "AI is off."],
      ["Image", "on"],
    ]);
  },
};

// czjw.189: a person without Ask is never offered a kind only Ask can add.
export const AddElementWithoutAsk: StoryObj<typeof SlideEditorBar> = {
  name: "Add element without Ask",
  globals: desktop,
  render: (args) => <SlideEditorBar {...args} />,
  args: {
    slide: titleAndTextSlide,
    theme: BLUE_THEME,
    first: false,
    ask: "none",
    onSteps: fn(),
    onAdd: fn(),
    onAsk: fn(),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add element" }));
    await expect(await menuItems()).toEqual([
      ["Text", SLIDE_RULE_MESSAGES.body],
      ["Bullets", SLIDE_RULE_MESSAGES.body],
      ["Image", "on"],
    ]);
  },
};

// T10-c: a title that already takes the theme style and cannot leave the slide has both More
// actions off, each with the rule or the state that refuses it.
export const RefusedActionsSayWhyOnPhone: Story = {
  name: "On a phone More says why Use theme style and Delete are off",
  globals: phone,
  // The story ends with the sheet open, so axe measures the reason lines. Base UI's focus guards
  // are `aria-hidden` on purpose (they hand focus on), so only they skip `aria-hidden-focus`.
  parameters: {
    a11y: {
      test: "error",
      config: {
        rules: [
          {
            id: "aria-hidden-focus",
            selector: '[aria-hidden="true"]:not([data-base-ui-focus-guard])',
          },
        ],
      },
    },
  },
  args: {
    element: title!,
    deleteRefusal: SLIDE_RULE_MESSAGES.firstNotTitle,
    onDelete: undefined,
  },
  play: async ({ canvasElement }) => {
    const sheet = await openMore(canvasElement, "Title");

    await expect(
      sheet.getByRole("button", {
        name: "Use theme style",
        description: "Already uses the theme style.",
      })
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      sheet.getByRole("button", {
        name: "Delete element",
        description: SLIDE_RULE_MESSAGES.firstNotTitle,
      })
    ).toHaveAttribute("aria-disabled", "true");
  },
};

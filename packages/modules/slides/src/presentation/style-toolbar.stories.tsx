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
          "The style controls of the selected slide element, variant A of the slide editor controls prototype (S7-43). A title, text or bullet list takes text color, font size, weight, alignment, fill, border and Position; a figure, chart, table or image takes fill, border and Position. Each control sends one `change-element` step. Position opens the nudge pad and the width and height steppers, in a popover on a desktop and a bottom sheet below 768 px, where the toolbar docks at the bottom of the screen.",
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

// P12-4: the phone dock sits at the bottom, every control inside the screen; Position is a sheet.
export const PhoneDock: Story = {
  name: "On a phone the toolbar docks at the bottom and Position is a sheet",
  globals: phone,
  args: { element: text!, index: 1, box: { x: 40, y: 136, w: 320, h: 348 } },
  play: async ({ args, canvas, canvasElement }) => {
    const toolbar = canvas.getByRole("toolbar", { name: "Text style" });

    const { innerWidth, innerHeight } =
      canvasElement.ownerDocument.defaultView!;

    await expect(Math.round(toolbar.getBoundingClientRect().bottom)).toBe(
      innerHeight
    );

    const outside = within(toolbar)
      .getAllByRole("button")
      .filter((control) => {
        const rect = control.getBoundingClientRect();

        return rect.right > innerWidth || rect.top < 0;
      })
      .map(
        (control) => control.getAttribute("aria-label") ?? control.textContent
      );

    await expect(outside).toEqual([]);

    await userEvent.click(canvas.getByRole("button", { name: /Position/ }));

    const sheet = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Position and size",
      })
    );

    await userEvent.click(sheet.getByRole("button", { name: "Move right" }));
    await expect(args.onStep).toHaveBeenCalledTimes(1);
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 48, y: 136, w: 320, h: 348 },
    });
  },
};

// The desktop popover holds its own PositionControl wiring; PhoneDock covers only the sheet.
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

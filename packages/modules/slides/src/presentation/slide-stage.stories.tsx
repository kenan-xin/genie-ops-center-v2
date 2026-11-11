import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fireEvent, fn, userEvent, waitFor } from "storybook/test";

import { deckPage, textWithChartSlide } from "./__fixtures__/decks.ts";
import { SlideStage } from "./slide-stage.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const meta = {
  title: "Modules/Slides/Slide stage",
  component: SlideStage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The editable slide of S7-43: each element is a button over the canvas. A selected element moves by drag, resizes by its four corner handles (44 px touch areas on a phone) and nudges with the arrow keys, 8 units, 1 with Shift. Each gesture or run of arrow presses within 800 ms calls `onStep` once with one `change-element` step, its box snapped to 8 and kept inside the slide, so it is one save and one Undo entry.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    slide: textWithChartSlide,
    figuresAsOf: deckPage.deck.figuresAsOf,
    timeZone: deckPage.timeZone,
    theme: deckPage.theme,
    logoUrl: deckPage.logoUrl,
    images: deckPage.deck.images,
    selected: 1,
    onSelect: fn(),
    onStep: fn(),
  },
  render: function Render(args) {
    const [selected, setSelected] = useState(args.selected);

    return (
      <div className="p-4">
        <SlideStage
          {...args}
          // A new function each render, as the deck page passes it, so a gesture must survive one.
          onStep={(step) => args.onStep(step)}
          selected={selected}
          onSelect={(index) => {
            setSelected(index);
            args.onSelect(index);
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof SlideStage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Client pixels for canvas units on the layer's current scale. */
function scaleOf(canvasElement: HTMLElement): number {
  const layer = canvasElement.querySelector<HTMLElement>(
    '[aria-label="Slide editing"]'
  );

  return (layer?.getBoundingClientRect().width ?? 960) / 960;
}

/** Presses at a point, moves by a canvas delta, and lets go. */
function drag(
  target: Element,
  canvasElement: HTMLElement,
  dx: number,
  dy: number
) {
  const scale = scaleOf(canvasElement);
  const rect = target.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  fireEvent.pointerDown(target, { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerMove(target, {
    clientX: x + (dx * scale) / 2,
    clientY: y + (dy * scale) / 2,
    pointerId: 1,
  });
  fireEvent.pointerMove(target, {
    clientX: x + dx * scale,
    clientY: y + dy * scale,
    pointerId: 1,
  });
  fireEvent.pointerUp(target, {
    clientX: x + dx * scale,
    clientY: y + dy * scale,
    pointerId: 1,
  });
}

const TEXT = /^Text "/;

// A drag of 104 by 48 canvas units from 40, 136 ends on 144, 184 (off the half-way point of a snap): one step.
const dragPlay: Story["play"] = async ({ args, canvas, canvasElement }) => {
  drag(canvas.getByRole("button", { name: TEXT }), canvasElement, 104, 48);

  await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(1));
  await expect(args.onStep).toHaveBeenCalledWith({
    op: "change-element",
    slideId: textWithChartSlide.id,
    index: 1,
    box: { x: 144, y: 184, w: 320, h: 348 },
  });
};

// Nothing selected at first, as on the deck page: the press selects, and the drag goes on.
export const DragMoves: Story = {
  name: "A drag moves the element in one step",
  globals: desktop,
  args: { selected: null },
  play: dragPlay,
};

export const DragMovesOnPhone: Story = {
  name: "A drag moves the element in one step on a phone",
  globals: phone,
  args: { selected: null },
  play: dragPlay,
};

// The save answers false (refused), so the text draws at its stored box again, not where it was dropped.
export const RefusedDragGoesBack: Story = {
  name: "A refused drag puts the element back",
  globals: desktop,
  args: { selected: null, onStep: fn(async () => false) },
  play: async ({ args, canvas, canvasElement }) => {
    const text = canvas.getByRole("button", { name: TEXT });
    const left = text.getBoundingClientRect().left;

    drag(text, canvasElement, 104, 48);

    await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: TEXT }).getBoundingClientRect().left
      ).toBeCloseTo(left, 0)
    );
  },
};

// The corner handle by -100, -200 from 320 x 348 ends on 224 x 152 after the snap: one step.
export const HandleResizes: Story = {
  name: "A corner handle resizes the element in one step",
  globals: desktop,
  play: async ({ args, canvasElement }) => {
    const handle = canvasElement.querySelector(
      '[data-stage-element="1"] [data-handle="se"]'
    );

    await expect(handle).not.toBeNull();
    drag(handle!, canvasElement, -100, -200);

    await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(1));
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 40, y: 136, w: 224, h: 152 },
    });
  },
};

// Three presses within 800 ms are one save: x 40 + 3 x 8. Escape deselects.
export const ArrowKeysNudge: Story = {
  name: "Arrow presses in a run make one step",
  globals: desktop,
  play: async ({ args, canvas }) => {
    const text = canvas.getByRole("button", { name: TEXT });

    text.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    await expect(args.onStep).not.toHaveBeenCalled();

    await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 64, y: 136, w: 320, h: 348 },
    });

    await userEvent.keyboard("{Escape}");
    await expect(args.onSelect).toHaveBeenLastCalledWith(null);
    await expect(text).toHaveAttribute("aria-pressed", "false");
  },
};

// The text's run saves when the chart's press starts, so each element keeps its own box.
export const NudgeTwoElements: Story = {
  name: "Arrow presses on two elements make one step each",
  globals: desktop,
  play: async ({ args, canvas }) => {
    canvas.getByRole("button", { name: TEXT }).focus();
    await userEvent.keyboard("{ArrowRight}");
    canvas.getByRole("button", { name: "The chart" }).focus();
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
    await expect(args.onStep).toHaveBeenNthCalledWith(1, {
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 48, y: 136, w: 320, h: 348 },
    });
    await expect(args.onStep).toHaveBeenNthCalledWith(2, {
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 2,
      box: { x: 384, y: 144, w: 536, h: 348 },
    });
  },
};

// The run saves when the drag starts, and the drag starts from x 48: 48 + 104, 136 + 48.
export const NudgeThenDrag: Story = {
  name: "A drag right after an arrow press keeps the drag",
  globals: desktop,
  args: { selected: null },
  play: async ({ args, canvas, canvasElement }) => {
    const text = canvas.getByRole("button", { name: TEXT });

    text.focus();
    await userEvent.keyboard("{ArrowRight}");
    drag(text, canvasElement, 104, 48);

    await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(2));
    await expect(args.onStep).toHaveBeenNthCalledWith(1, {
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 48, y: 136, w: 320, h: 348 },
    });
    await expect(args.onStep).toHaveBeenNthCalledWith(2, {
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 152, y: 184, w: 320, h: 348 },
    });

    // Past the 800 ms run: no late step lands on top of the drag.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await expect(args.onStep).toHaveBeenCalledTimes(2);
  },
};

// czjw.141: each press reports the run's box, so the toolbar's Position starts from it; the run's
// save reports null, so the toolbar goes back to the stored box.
export const NudgeRunReportsItsBox: Story = {
  name: "An arrow run reports its box until it saves",
  globals: desktop,
  args: { onRunBox: fn() },
  play: async ({ args, canvas }) => {
    canvas.getByRole("button", { name: TEXT }).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");

    await expect(args.onRunBox).toHaveBeenLastCalledWith({
      index: 1,
      box: { x: 56, y: 136, w: 320, h: 348 },
    });

    await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    await expect(args.onRunBox).toHaveBeenLastCalledWith(null);
  },
};

// A slide switch unmounts the stage within the run; the press is still saved.
export const NudgeThenUnmount: Story = {
  name: "An arrow press is saved when the stage closes",
  globals: desktop,
  render: function Render(args) {
    const [open, setOpen] = useState(true);

    return (
      <div className="grid gap-2 p-4">
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
        {open ? (
          <SlideStage {...args} onStep={(step) => args.onStep(step)} />
        ) : null}
      </div>
    );
  },
  play: async ({ args, canvas }) => {
    canvas.getByRole("button", { name: TEXT }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));

    // Under the 800 ms run, so only the save on unmount can pass.
    await waitFor(() => expect(args.onStep).toHaveBeenCalledTimes(1), {
      timeout: 400,
    });
    await expect(args.onStep).toHaveBeenCalledWith({
      op: "change-element",
      slideId: textWithChartSlide.id,
      index: 1,
      box: { x: 48, y: 136, w: 320, h: 348 },
    });
  },
};

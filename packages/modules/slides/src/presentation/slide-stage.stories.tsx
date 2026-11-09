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

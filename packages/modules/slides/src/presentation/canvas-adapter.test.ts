import { describe, expect, it } from "vitest";

import type { CanvasGesture } from "../lib/canvas-interactions/canvas-interactions.ts";
import { gestureBox, movedBox, resizedBox } from "./canvas-adapter.ts";

const pointer = { x: 0, y: 0 };

const move = (x: number, y: number): CanvasGesture<number> => ({
  kind: "move",
  objectIds: [1],
  startPointer: pointer,
  pointer,
  clientDelta: { x, y },
  canvasDelta: { x, y },
  duplicate: false,
});

const resize = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): CanvasGesture<number> => ({
  kind: "resize",
  objectIds: [1],
  startPointer: pointer,
  pointer,
  clientDelta: pointer,
  canvasDelta: pointer,
  duplicate: false,
  handle: "se",
  startRect: { x: 40, y: 136, width: 320, height: 160 },
  rect,
});

const text = { x: 40, y: 136, w: 320, h: 160 };

describe("the canvas adapter", () => {
  it("snaps a move to 8 units", () => {
    expect(gestureBox(move(13, 5), text, "text")).toEqual({
      x: 56,
      y: 144,
      w: 320,
      h: 160,
    });
  });

  it("keeps a move that ends past the edge inside the canvas", () => {
    expect(gestureBox(move(900, 900), text, "text")).toEqual({
      x: 640,
      y: 380,
      w: 320,
      h: 160,
    });
  });

  it("stops a resize at the kind's minimum box", () => {
    expect(
      gestureBox(resize({ x: 40, y: 136, width: 10, height: 10 }), text, "text")
    ).toEqual({ x: 40, y: 136, w: 80, h: 32 });
    expect(
      gestureBox(
        resize({ x: 40, y: 136, width: 10, height: 10 }),
        text,
        "chart"
      )
    ).toEqual({ x: 40, y: 136, w: 160, h: 96 });
  });

  it("snaps a resize to 8 units and keeps it inside the canvas", () => {
    expect(
      gestureBox(
        resize({ x: 40, y: 136, width: 1203, height: 61 }),
        text,
        "text"
      )
    ).toEqual({ x: 40, y: 136, w: 920, h: 64 });
  });

  it("nudges by any step and keeps the box inside the canvas", () => {
    expect(movedBox(text, { x: -1, y: 0 }, "text")).toEqual({ ...text, x: 39 });
    expect(movedBox(text, { x: -48, y: -200 }, "text")).toEqual({
      ...text,
      x: 0,
      y: 0,
    });
  });

  it("steps the size, never under the minimum or past the edge", () => {
    expect(resizedBox(text, { w: 8, h: -8 }, "text")).toEqual({
      ...text,
      w: 328,
      h: 152,
    });
    expect(resizedBox(text, { w: -400, h: 0 }, "text")).toEqual({
      ...text,
      w: 80,
    });
    expect(resizedBox(text, { w: 800, h: 0 }, "text")).toEqual({
      ...text,
      w: 920,
    });
  });
});

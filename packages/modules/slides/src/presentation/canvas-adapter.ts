import {
  type DeckChange,
  type ElementBox,
  type ElementKind,
  minBox,
  SLIDE_CANVAS,
} from "../contract.ts";
import type { CanvasGesture } from "../lib/canvas-interactions/canvas-interactions.ts";

/** A drag or a resize snaps to 8 canvas units (tech plan, Element position). */
export const SNAP = 8;

const snap = (value: number) => Math.round(value / SNAP) * SNAP;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** A box with its size at least the kind's minimum and its place inside the canvas. */
function inside(box: ElementBox, kind: ElementKind): ElementBox {
  const min = minBox(kind);
  const w = clamp(Math.round(box.w), min.w, SLIDE_CANVAS.width);
  const h = clamp(Math.round(box.h), min.h, SLIDE_CANVAS.height);

  return {
    x: clamp(Math.round(box.x), 0, SLIDE_CANVAS.width - w),
    y: clamp(Math.round(box.y), 0, SLIDE_CANVAS.height - h),
    w,
    h,
  };
}

/** The box a move or a resize ends on: snapped to 8, at least the minimum, inside the canvas. */
export function gestureBox(
  gesture: CanvasGesture<number>,
  start: ElementBox,
  kind: ElementKind
): ElementBox {
  if (gesture.kind === "move") {
    return inside(
      {
        ...start,
        x: snap(start.x + gesture.canvasDelta.x),
        y: snap(start.y + gesture.canvasDelta.y),
      },
      kind
    );
  }

  const x = snap(gesture.rect.x);
  const y = snap(gesture.rect.y);

  const right = Math.min(
    snap(gesture.rect.x + gesture.rect.width),
    SLIDE_CANVAS.width
  );

  const bottom = Math.min(
    snap(gesture.rect.y + gesture.rect.height),
    SLIDE_CANVAS.height
  );

  return inside({ x, y, w: right - x, h: bottom - y }, kind);
}

/** A box moved by a nudge or the Position pad, with no snap, kept inside the canvas. */
export function movedBox(
  box: ElementBox,
  delta: { readonly x: number; readonly y: number },
  kind: ElementKind
): ElementBox {
  return inside({ ...box, x: box.x + delta.x, y: box.y + delta.y }, kind);
}

/** A box resized by the width and height steppers, kept inside the canvas. */
export function resizedBox(
  box: ElementBox,
  delta: { readonly w: number; readonly h: number },
  kind: ElementKind
): ElementBox {
  // The size grows to the edge and stops; the place stays.
  return inside(
    {
      ...box,
      w: Math.min(box.w + delta.w, SLIDE_CANVAS.width - box.x),
      h: Math.min(box.h + delta.h, SLIDE_CANVAS.height - box.y),
    },
    kind
  );
}

/** One gesture, nudge run or stepper press is one step, so one save and one Undo entry. */
export function boxStep(
  slideId: string,
  index: number,
  box: ElementBox
): Extract<DeckChange, { op: "change-element" }> {
  return { op: "change-element", slideId, index, box };
}

/**
 * One row that scrolls sideways (X-6, czjw.176): the slide strip, the filter chips, the Branding tab
 * row. A swipe stays in the row, also at its ends. Put it beside the place's own classes, with
 * `horizontalStripWheel` as the element's ref.
 */
export const horizontalStrip =
  "overflow-x-auto overscroll-x-contain touch-pan-x touch-pan-y";

/** Firefox can report a mouse wheel in lines; one line is about this many pixels. */
const LINE_HEIGHT = 16;

function turnWheelSideways(event: WheelEvent): void {
  const strip = event.currentTarget;

  if (
    !(strip instanceof HTMLElement) ||
    event.ctrlKey ||
    event.deltaX !== 0 ||
    event.deltaY === 0
  ) {
    return;
  }

  const before = strip.scrollLeft;

  strip.scrollLeft +=
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * LINE_HEIGHT
      : event.deltaY;

  // Decided by what moved, not by sums: at either end, without overflow, or on a box that does not
  // scroll (`md:overflow-visible`) nothing moves, and the wheel goes on to the page.
  if (strip.scrollLeft !== before) event.preventDefault();
}

/**
 * The strip's ref: a vertical mouse wheel scrolls the strip sideways while it can move that way.
 * React adds wheel listeners as passive, where `preventDefault` does nothing, so this adds its own.
 */
export function horizontalStripWheel(
  strip: HTMLElement | null
): (() => void) | undefined {
  if (strip === null) return undefined;

  strip.addEventListener("wheel", turnWheelSideways, { passive: false });

  return () => strip.removeEventListener("wheel", turnWheelSideways);
}

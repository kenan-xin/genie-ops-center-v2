/**
 * One row that scrolls sideways (X-6, czjw.176): the slide strip, the filter chips, the Branding tab
 * row. A swipe stays in the row, also at its ends. Put it beside the place's own classes, with
 * `horizontalStripWheel` as the element's ref.
 */
export const horizontalStrip =
  "overflow-x-auto overscroll-x-contain touch-pan-x touch-pan-y data-strip-more:[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]";

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
 * Marks the strip while more of the row lies past its end; 1 px absorbs a fractional scroll. A box
 * that does not scroll sideways (`md:overflow-visible`) shows all of its row, so it is never marked.
 */
function markMore(strip: HTMLElement): void {
  strip.toggleAttribute(
    "data-strip-more",
    getComputedStyle(strip).overflowX !== "visible" &&
      strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1
  );
}

/**
 * The strip's ref: a vertical mouse wheel scrolls the strip sideways while it can move that way.
 * It also marks the strip `data-strip-more` while more of the row lies past its end, so
 * `horizontalStrip` fades that edge (czjw.176).
 */
export function horizontalStripWheel(
  strip: HTMLElement | null
): (() => void) | undefined {
  if (strip === null) return undefined;

  const mark = () => markMore(strip);
  // A resize covers the width and a later font; the child list covers items that join later.
  const resized = new ResizeObserver(mark);
  const changed = new MutationObserver(mark);

  strip.addEventListener("wheel", turnWheelSideways, { passive: false });
  strip.addEventListener("scroll", mark, { passive: true });
  resized.observe(strip);
  changed.observe(strip, { childList: true });
  mark();

  return () => {
    strip.removeEventListener("wheel", turnWheelSideways);
    strip.removeEventListener("scroll", mark);
    resized.disconnect();
    changed.disconnect();
  };
}

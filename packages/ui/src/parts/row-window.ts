"use client";

import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useState, type RefObject } from "react";

/** A list of more rows than this renders only the rows near the screen (czjw.70, LH7). */
export const VIRTUAL_FROM = 100;

export type RowWindow = {
  /** The row indexes to render, in order. */
  readonly indexes: readonly number[];
  /** The height of the rows above the first rendered row, in px. */
  readonly before: number;
  /** The height of the rows below the last rendered row, in px. */
  readonly after: number;
  /** The ref of each rendered row, which carries `data-index`, so its real height counts. */
  readonly measure: (element: Element | null) => void;
};

/**
 * The nearest ancestor of `element` that scrolls vertically, or `null` for the window. The
 * table's own sideways scroller never counts: its `overflow-x` makes `overflow-y` compute to
 * `auto`, but it never scrolls down.
 */
export function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (
    let node = element.parentElement;
    node !== null;
    node = node.parentElement
  ) {
    if (node.dataset.slot === "table-container") continue;

    const { overflowY } = getComputedStyle(node);

    if (overflowY === "auto" || overflowY === "scroll") return node;
  }

  return null;
}

// Before the first measure (and on the server), a window of a laptop screen.
const initialRect = { width: 1280, height: 800 };

/**
 * The rows of a long list that sit near the screen. The window follows the nearest scrolling
 * ancestor of `anchor`, else the page (LH8): the shell scrolls its content, Storybook the page.
 * With `enabled: false` it answers every index.
 */
export function useRowWindow(input: {
  readonly count: number;
  readonly enabled: boolean;
  readonly estimateSize: number;
  readonly anchor: RefObject<HTMLElement | null>;
}): RowWindow {
  const { count, enabled, estimateSize, anchor } = input;

  // `undefined` until the first layout effect, then the scroller or `null` for the window.
  const [scroller, setScroller] = useState<HTMLElement | null | undefined>();

  const [scrollMargin, setScrollMargin] = useState(0);

  // Every render: rows or a banner above the list can move its top.
  useLayoutEffect(() => {
    const element = anchor.current;

    if (!enabled || element === null) return;

    const parent = scrollParentOf(element);
    const top = element.getBoundingClientRect().top;

    const margin =
      parent === null
        ? top + window.scrollY
        : top - parent.getBoundingClientRect().top + parent.scrollTop;

    setScroller(parent);
    setScrollMargin((current) =>
      Math.abs(current - margin) < 1 ? current : margin
    );
  });

  const shared = {
    count,
    estimateSize: () => estimateSize,
    overscan: 10,
    initialRect,
    scrollMargin,
  };

  // Hooks cannot be called conditionally, so both exist and at most one is on.
  const inElement = useVirtualizer({
    ...shared,
    enabled: enabled && scroller !== null && scroller !== undefined,
    getScrollElement: () => scroller ?? null,
  });

  const inWindow = useWindowVirtualizer({
    ...shared,
    // Before the first effect the window one answers the first screen, as on the server.
    enabled: enabled && (scroller === null || scroller === undefined),
  });

  if (!enabled) {
    return {
      indexes: Array.from({ length: count }, (_, index) => index),
      before: 0,
      after: 0,
      measure: () => undefined,
    };
  }

  const virtualizer =
    scroller === null || scroller === undefined ? inWindow : inElement;

  const items = virtualizer.getVirtualItems();
  const first = items[0];
  const last = items.at(-1);

  return {
    indexes: items.map((item) => item.index),
    before: first === undefined ? 0 : first.start - scrollMargin,
    after:
      last === undefined
        ? 0
        : virtualizer.getTotalSize() - (last.end - scrollMargin),
    measure: virtualizer.measureElement,
  };
}

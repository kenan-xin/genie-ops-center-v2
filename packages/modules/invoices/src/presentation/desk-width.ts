"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/*
 * A desk chooses its layout from its own width, not from the viewport, because the docked agent
 * panel (400 px from 1280 px, Spec 07 R-42) narrows the page (P16g-4). The desk's own width at a
 * 1280 and a 1024 px viewport, with the 240 px menu and 32 px page padding on each side, is 976
 * and 720 px; each threshold keeps 32 px for a classic scrollbar (P16g-5). With the panel docked,
 * 1280 px gives the pager and the narrow record desk, and 1440 px gives the middle review desk and
 * the narrow record desk.
 */

/** From this width of its own root, a desk pins each read field beside its line and shows its side column. */
export const DESK_PINS_FROM = 944;

/** From this width of its own root, a review is a desk; below it, the pager. */
export const DESK_FROM = 688;

/** The width of `element` in CSS pixels, before the first paint and after every resize; undefined until it mounts. */
export function useWidth(
  element: RefObject<HTMLElement | null>
): number | undefined {
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const target = element.current;

    if (target === null) return;

    const measure = () => setWidth(target.getBoundingClientRect().width);

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(target);

    return () => observer.disconnect();
  }, [element]);

  return width;
}

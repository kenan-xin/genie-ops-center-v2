"use client";

import { useEffect, useRef } from "react";

/** How long a navigation waits for its page to replace a loading skeleton. */
const WAIT_MS = 10_000;

/** The new page's heading, else its `main`, once no skeleton holds the content area. */
function pageTarget(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>(
    '[data-shell-content] main:not([aria-busy="true"])'
  );

  return main === null ? null : (main.querySelector<HTMLElement>("h1") ?? main);
}

function focusTarget(target: HTMLElement): void {
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;

  target.focus({ preventScroll: true });
}

/**
 * After a client navigation the browser keeps no focus, because the old page left the DOM. This
 * moves focus to the new page's heading, which screen readers read, once the page has replaced any
 * loading skeleton (NAV-1 decision 6). The host renders it once, outside every page, with its
 * router's pathname. The first render moves nothing, so a document load keeps the browser's focus.
 */
export function RouteFocus(props: { readonly path: string }) {
  const shownPath = useRef(props.path);

  useEffect(() => {
    if (shownPath.current === props.path) return;

    shownPath.current = props.path;

    const now = pageTarget();

    if (now !== null) {
      focusTarget(now);

      return;
    }

    let timer = 0;

    const observer = new MutationObserver(() => {
      const later = pageTarget();

      if (later === null) return;

      observer.disconnect();
      window.clearTimeout(timer);
      focusTarget(later);
    });

    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };

    observer.observe(document.body, { childList: true, subtree: true });
    timer = window.setTimeout(stop, WAIT_MS);

    // A newer path or an unmount ends the wait.
    return stop;
  }, [props.path]);

  return null;
}

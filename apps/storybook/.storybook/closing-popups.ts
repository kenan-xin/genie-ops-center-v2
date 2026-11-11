import { waitFor } from "storybook/test";

/**
 * Resolves when no Base UI popup is closing (xok3.73). A play that ends on a pick or an Escape
 * leaves the popup mounted for a few frames, marked `data-closed`, and axe then reads its focus
 * guards and its unnamed listbox. An open popup is not waited for, and a kept-mounted closed
 * popup is hidden, so neither holds the wait.
 *
 * shortcut: it sees only a close that already started and only Base UI popups. A play whose close
 * follows an async step still waits for it itself. A `hiddenUntilFound` panel in an open portal
 * stays visible with `data-closed`; narrow the selector to popup roles if one is added.
 */
export async function waitForClosingPopups(): Promise<void> {
  await waitFor(
    () => {
      const closing = [
        ...document.querySelectorAll("[data-base-ui-portal] [data-closed]"),
      ].find((element) => element.checkVisibility());

      if (closing !== undefined) {
        throw new Error(
          `A popup is still closing after the play: ${closing.getAttribute("role") ?? closing.tagName.toLowerCase()}.`
        );
      }
    },
    { timeout: 3000 }
  );
}

import type { Locator } from "@playwright/test";

/** One state of a chat's steps while a run works (czjw.181). */
export type LiveRowState = {
  /** How many rows carry `aria-current="step"`. */
  readonly live: number;
  /** The text of the first live row. */
  readonly text: string;
  /**
   * The strip button shows: "n steps" once the answer's text starts, "Worked for … · n steps" once
   * the run ended (P15-17, Review Focus 1).
   */
  readonly folded: boolean;
  /** The computed `border-top-style` and `animation-name` of the live row's `[data-slot=live-node]`. */
  readonly ring: { readonly border: string; readonly animation: string } | null;
};

/** The region element, with the states `recordLiveRows` saw in it, in order. */
type Recorded = Element & { genieLiveRows?: LiveRowState[] };

/**
 * Records every state of the steps in `region`, from now on, through a MutationObserver in the page.
 * A poll from the test would miss a row that vanishes for one frame between two steps.
 */
export async function recordLiveRows(region: Locator): Promise<void> {
  await region.evaluate((element) => {
    const states: LiveRowState[] = [];

    const read = (): LiveRowState => {
      const rows = element.querySelectorAll(
        'ol[aria-label="Steps"] > li[aria-current="step"]'
      );

      const node = rows[0]?.querySelector("[data-slot=live-node]");

      const style =
        node === null || node === undefined ? null : getComputedStyle(node);

      return {
        live: rows.length,
        text: rows[0]?.textContent ?? "",
        folded: [...element.querySelectorAll("button")].some((button) =>
          /^(Worked for .+ · )?\d+ steps?$/.test(button.textContent ?? "")
        ),
        ring:
          style === null
            ? null
            : { border: style.borderTopStyle, animation: style.animationName },
      };
    };

    const note = () => {
      const state = read();

      if (JSON.stringify(states.at(-1)) !== JSON.stringify(state))
        states.push(state);
    };

    // SAFETY: only this recorder writes the optional property, so the wider type adds no claim.
    (element as Recorded).genieLiveRows = states;
    note();
    new MutationObserver(note).observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
}

export async function liveRowStates(
  region: Locator
): Promise<readonly LiveRowState[]> {
  const states = await region.evaluate(
    // SAFETY: the property is optional; undefined means the recorder never ran, checked below.
    (element) => (element as Recorded).genieLiveRows
  );

  if (states === undefined)
    throw new Error(
      "recordLiveRows never ran on this region, or it remounted."
    );

  return states;
}

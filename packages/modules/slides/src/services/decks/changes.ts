import { AppError } from "@genie/core";
import { isEqual } from "es-toolkit";

import type { DeckContent, StoredElement, UndoEntry } from "../../content.ts";
import {
  DECK_SLIDE_LIMIT,
  type DeckChange,
  type ElementInput,
  UNDO_DEPTH,
} from "../../contract.ts";
import { SLIDES_ERRORS } from "../../errors.ts";

export type DraftElement =
  | StoredElement
  | Extract<ElementInput, { kind: "figure" | "chart" | "table" }>;

export type DraftSlide = {
  readonly id: string;
  readonly elements: readonly DraftElement[];
};

export type AppliedChanges = {
  readonly title: string;
  readonly slides: readonly DraftSlide[];
  /** Each data element to gate, as `<slideId>.<elementIndex>`, with the index of the last step that set it. */
  readonly checks: ReadonlyMap<string, number>;
};

function refuse(path: string, message: string): never {
  throw new AppError(SLIDES_ERRORS["change-invalid"], {
    issues: [{ path, message }],
  });
}

/** `s` + the highest number plus one, so an id stays unique on this deck (D5). */
export function nextSlideId(
  slides: readonly { readonly id: string }[]
): string {
  const highest = Math.max(0, ...slides.map(({ id }) => Number(id.slice(1))));

  return `s${highest + 1}`;
}

/** The saves Undo can restore, newest first, at most `UNDO_DEPTH` (D1). */
export function pushUndo(
  stack: readonly UndoEntry[],
  entry: UndoEntry
): readonly UndoEntry[] {
  return [entry, ...stack].slice(0, UNDO_DEPTH);
}

/**
 * A changed slide's elements. A data element whose chart equals a stored one of the same kind on
 * that slide keeps the stored chart and data, so a hand edit never re-reads a frozen figure
 * (R-54); every other data element is set to be checked.
 */
function changedElements(
  stored: readonly DraftElement[],
  input: readonly ElementInput[]
) {
  const checked: number[] = [];

  const elements = input.map((element, index): DraftElement => {
    if (
      element.kind !== "figure" &&
      element.kind !== "chart" &&
      element.kind !== "table"
    ) {
      return element;
    }

    const same = stored.find(
      (candidate) =>
        candidate.kind === element.kind &&
        "data" in candidate &&
        isEqual(candidate.chart, element.chart)
    );

    if (same !== undefined) return same;

    checked.push(index);

    return element;
  });

  return { elements, checked };
}

/**
 * The deck after every step, in order. The first refused step throws, so no step applies on its
 * own. Pure: the input is copied, never changed, and no chart is checked here.
 */
export function applyChanges(
  current: { readonly title: string; readonly content: DeckContent },
  changes: readonly DeckChange[]
): AppliedChanges {
  let { title } = current;
  const slides: DraftSlide[] = [...current.content.slides];
  const checks = new Map<string, number>();

  const forget = (slideId: string) => {
    for (const key of checks.keys()) {
      if (key.startsWith(`${slideId}.`)) checks.delete(key);
    }
  };

  const setSlide = (
    step: number,
    id: string,
    stored: readonly DraftElement[],
    input: readonly ElementInput[]
  ): DraftSlide => {
    const { elements, checked } = changedElements(stored, input);

    forget(id);

    for (const index of checked) checks.set(`${id}.${index}`, step);

    return { id, elements };
  };

  for (const [step, change] of changes.entries()) {
    if (change.op === "rename") {
      ({ title } = change);
      continue;
    }

    if (change.op === "add-slide") {
      if (slides.length >= DECK_SLIDE_LIMIT) {
        refuse(
          `changes.${step}`,
          `A deck holds at most ${DECK_SLIDE_LIMIT} slides.`
        );
      }

      const toIndex = change.toIndex ?? slides.length;

      if (toIndex > slides.length) {
        refuse(
          `changes.${step}.toIndex`,
          `This deck has no place ${toIndex}; a new slide goes at place ${slides.length} at most.`
        );
      }

      slides.splice(
        toIndex,
        0,
        setSlide(step, nextSlideId(slides), [], change.slide.elements)
      );
      continue;
    }

    const index = slides.findIndex(({ id }) => id === change.slideId);
    const found = slides[index];

    if (found === undefined) {
      refuse(
        `changes.${step}.slideId`,
        `No slide ${change.slideId} in this deck.`
      );
    }

    if (change.op === "remove-slide") {
      slides.splice(index, 1);
      forget(found.id);
    } else if (change.op === "move-slide") {
      if (change.toIndex > slides.length - 1) {
        refuse(
          `changes.${step}.toIndex`,
          `This deck has no place ${change.toIndex}; its last place is ${slides.length - 1}.`
        );
      }

      slides.splice(index, 1);
      slides.splice(change.toIndex, 0, found);
    } else {
      slides[index] = setSlide(
        step,
        found.id,
        found.elements,
        change.slide.elements
      );
    }
  }

  return { title, slides, checks };
}

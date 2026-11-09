import { AppError } from "@genie/core";
import { isEqual } from "es-toolkit";

import type { DeckContent, StoredElement, UndoEntry } from "../../content.ts";
import {
  DECK_SLIDE_LIMIT,
  type DeckChange,
  type ElementInput,
  type ElementStyle,
  elementStyle,
  type StyleChange,
  UNDO_DEPTH,
} from "../../contract.ts";
import { SLIDES_ERRORS } from "../../errors.ts";

export type DraftElement =
  | StoredElement
  | Extract<ElementInput, { kind: "figure" | "chart" | "table" }>;

export type DraftSlide = {
  readonly id: string;
  readonly elements: readonly DraftElement[];
  readonly background?: string | undefined;
};

const NO_FIELD = "Name a box, a style or a background to change.";

/** A style after a change: `null` clears it all, else each named key is set or cleared. */
function mergedStyle(
  style: ElementStyle | undefined,
  change: StyleChange | null
): ElementStyle | undefined {
  if (change === null) return undefined;

  const kept = Object.fromEntries(
    Object.entries({ ...style, ...change }).filter(
      ([, value]) => value !== null && value !== undefined
    )
  );

  // The parse types the kept keys; each came from a parsed style or a parsed change.
  return Object.keys(kept).length === 0 ? undefined : elementStyle.parse(kept);
}

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

    // The stored chart and data, with the box and style the change sends.
    if (same !== undefined) {
      return { ...same, box: element.box, style: element.style };
    }

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
    input: readonly ElementInput[],
    background: string | undefined
  ): DraftSlide => {
    const { elements, checked } = changedElements(stored, input);

    forget(id);

    for (const index of checked) checks.set(`${id}.${index}`, step);

    return { id, elements, background };
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
        setSlide(
          step,
          nextSlideId(slides),
          [],
          change.slide.elements,
          change.slide.background
        )
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
    } else if (change.op === "change-element") {
      if (change.box === undefined && change.style === undefined) {
        refuse(`changes.${step}`, NO_FIELD);
      }

      const element = found.elements[change.index];

      if (element === undefined) {
        refuse(
          `changes.${step}.index`,
          `Slide ${found.id} has no element ${change.index}.`
        );
      }

      const changed = {
        ...element,
        box: change.box === undefined ? element.box : (change.box ?? undefined),
        style:
          change.style === undefined
            ? element.style
            : mergedStyle(element.style, change.style),
      };

      slides[index] = {
        ...found,
        elements: found.elements.with(change.index, changed),
      };
    } else if (change.op === "change-slide-fields") {
      if (change.background === undefined) refuse(`changes.${step}`, NO_FIELD);

      slides[index] = { ...found, background: change.background ?? undefined };
    } else {
      // A changed slide keeps its background unless the step names one: change-slide-fields clears it.
      slides[index] = setSlide(
        step,
        found.id,
        found.elements,
        change.slide.elements,
        change.slide.background ?? found.background
      );
    }
  }

  return { title, slides, checks };
}

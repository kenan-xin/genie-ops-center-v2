import { describe, expect, it } from "vitest";

import { SLIDES_SURFACE_INSTRUCTIONS } from "./agent-surface.ts";
import { deckChange, elementStyle } from "./contract.ts";

/**
 * The words of the "You can change" line for each step and each style key (R-46a). A step or a
 * key the schema gains without a word here fails the first test, so S7-45 to S7-47 extend the
 * line when they add one.
 */
const STEP_WORDS = {
  "add-slide": "slides",
  "change-slide": "each slide's title",
  "remove-slide": "slides",
  "move-slide": "their order",
  "rename": "the deck's name",
  "change-element": "each element's position and size",
  "change-slide-fields": "the slide background",
};

const STYLE_WORDS = {
  color: "text color",
  fontSize: "size",
  weight: "weight",
  align: "alignment",
  fill: "fill",
  border: "border",
};

/** A word per field of the change-slide-fields step, so a field it gains needs a word (S7-45). */
const FIELD_WORDS = {
  background: "the slide background",
  notes: "speaker notes",
};

const BOX_WORDS = "position and size,";

const slideFieldsStep = deckChange.options.find(
  (option) => option.shape.op.value === "change-slide-fields"
)?.shape;

const line = SLIDES_SURFACE_INSTRUCTIONS.lines.find((text) =>
  text.startsWith("You can change")
);

describe("the Slides surface's You can change line", () => {
  it("has a word for every step kind and every style key of the schema", () => {
    expect(Object.keys(STEP_WORDS).toSorted()).toEqual(
      deckChange.options.map((option) => option.shape.op.value).toSorted()
    );
    expect(Object.keys(STYLE_WORDS).toSorted()).toEqual(
      Object.keys(elementStyle.shape).toSorted()
    );
    expect(Object.keys(FIELD_WORDS).toSorted()).toEqual(
      Object.keys(slideFieldsStep ?? {})
        .filter((key) => key !== "op" && key !== "slideId")
        .toSorted()
    );
  });

  it("names each of those words", () => {
    const whole = line ?? "";

    // The style list follows the box words; read from there, "size" cannot match "position and size".
    const styleStart = whole.indexOf(BOX_WORDS) + BOX_WORDS.length;

    const missing = [
      ...[...Object.values(STEP_WORDS), ...Object.values(FIELD_WORDS)].filter(
        (word) => !whole.includes(word)
      ),
      ...Object.values(STYLE_WORDS).filter(
        (word) => !whole.includes(word, styleStart)
      ),
    ];

    expect(missing).toEqual([]);
  });
});

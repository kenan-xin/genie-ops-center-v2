import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SLIDES_SURFACE } from "./agent-surface.ts";
import { SLIDES_AGENT_INSTRUCTIONS } from "./agent-tools.ts";

/** Every sentence the server refuses a slide with (`contract.ts`, `content.ts`). */
const RULES = [
  "A slide starts with its title, the one claim of the slide.",
  "A slide has one title.",
  "A slide holds at most one text or bullet list.",
  "A slide holds at most two figures, charts, tables or images.",
  "A table shares its slide with one text or one other figure, chart or image, not both.",
  "A slide table shows at most 12 rows and 5 columns. Limit or group the query.",
  "A slide chart shows at most 60 points. Group the query by month or limit it.",
];

describe("the slides-create-deck input", () => {
  // A live model got these rules only from refusals and ran out of chat steps (czjw.58).
  it("states every slide rule in the JSON schema the model receives", () => {
    const tool = SLIDES_SURFACE.tools.find(
      ({ name }) => name === "slides-create-deck"
    );

    const schema = JSON.stringify(
      z.toJSONSchema(tool?.input ?? z.never(), { target: "draft-7" })
    );

    expect(RULES.filter((rule) => !schema.includes(rule))).toEqual([]);
  });
});

describe("the slides read rules", () => {
  it("answers a number typed into a deck from a query first, names the deck's number with its date, and never asks", () => {
    // Anchored on the line's start: the first line also says "typed elements".
    const rule = SLIDES_AGENT_INSTRUCTIONS.lines.find((line) =>
      line.startsWith("A number in a deck's title")
    );

    expect(rule).toContain("is text that a person typed, not a record");
    expect(rule).toContain("start with the value from a query-dataset result");
    expect(rule).toContain(
      "with the figures date when it is not the reporting date"
    );
    expect(rule).toContain("Never ask which number to use.");
  });
});

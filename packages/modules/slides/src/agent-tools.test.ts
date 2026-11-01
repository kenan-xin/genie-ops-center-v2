import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SLIDES_AGENT_TOOLS } from "./agent-tools.ts";

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
    const tool = SLIDES_AGENT_TOOLS.find(
      ({ name }) => name === "slides-create-deck"
    );

    const schema = JSON.stringify(
      z.toJSONSchema(tool?.input ?? z.never(), { target: "draft-7" })
    );

    expect(RULES.filter((rule) => !schema.includes(rule))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { SLIDE_RULE_MESSAGES } from "../contract.ts";
import { addRefusal } from "./slide-rules.ts";

describe("the reason a slide refuses one more element", () => {
  it("a slide with two visuals refuses an image with the visual rule", () => {
    expect(addRefusal(["title", "figure", "chart"], "image")).toBe(
      SLIDE_RULE_MESSAGES.visual
    );
  });

  it("an image beside a text and a table gets the table rule", () => {
    expect(addRefusal(["title", "text", "table"], "image")).toBe(
      SLIDE_RULE_MESSAGES.table
    );
  });

  it("a slide with room takes the image", () => {
    expect(addRefusal(["title", "text"], "image")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import { chatTitleFrom } from "./contract.ts";
import { startText } from "./start-record.ts";

describe("the start of a record's run from its page", () => {
  // Bug caught: a title longer than the rename limit, or a title with the description's line breaks.
  it("chatTitleFrom keeps 80 characters on one line", () => {
    expect(chatTitleFrom("a".repeat(81))).toBe("a".repeat(80));
    expect(chatTitleFrom("  Q4\n\n review ")).toBe("Q4 review");
  });

  // Bug caught: core text that names a module's record, or a first message without the description.
  it("startText ends with the description and names no module's record", () => {
    const text = startText("October collections");

    expect(text.endsWith("Description: October collections")).toBe(true);
    expect(text).not.toMatch(/\bdeck\b/i);
  });
});

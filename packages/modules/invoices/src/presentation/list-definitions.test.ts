import { describe, expect, it } from "vitest";

import { documentListDefinition } from "./list-definitions.ts";

describe("documentListDefinition", () => {
  // F2: the glossary's tab words in their order, on the address values links and counts use (G22).
  it("shows All, To review, Processing, Processed on the old values", () => {
    expect(
      documentListDefinition.tabs.items.map(({ value, label }) => [
        value,
        label,
      ])
    ).toEqual([
      ["all", "All"],
      ["needs-you", "To review"],
      ["reading", "Processing"],
      ["done", "Processed"],
    ]);
  });
});

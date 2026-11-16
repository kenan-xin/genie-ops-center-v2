import { describe, expect, it } from "vitest";

import { ICON_ALIGNMENT_ALLOW_LIST } from "./icon-alignment-allow-list.ts";

// A bead id (`6wz1.113`, `genie-ops-center-v2-czjw.177`) or a design document (`tokens.md`).
const SOURCE = /\b[a-z0-9]{4}\.\d+\b|\b[\w-]+\.md\b/;

describe("the icon alignment allow list", () => {
  // T4-b: an entry hides every relation of the icons it matches, so it never goes in unexplained.
  it("gives every entry a selector and a reason that names its source", () => {
    for (const entry of ICON_ALIGNMENT_ALLOW_LIST) {
      expect(entry.selector.trim(), JSON.stringify(entry)).not.toBe("");
      expect(entry.reason, JSON.stringify(entry)).toMatch(SOURCE);
    }
  });
});

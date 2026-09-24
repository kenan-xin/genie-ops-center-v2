import { describe, expect, it } from "vitest";

import { foregroundFor } from "./foreground.ts";

describe("foregroundFor", () => {
  it("uses near-black text for a light primary color", () => {
    expect(foregroundFor("#f8fafc")).toBe("#111827");
  });
});

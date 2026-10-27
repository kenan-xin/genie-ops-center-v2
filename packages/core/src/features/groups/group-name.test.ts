import { describe, expect, it } from "vitest";

import { looksLikeId } from "./group-name.tsx";

describe("looksLikeId", () => {
  it("shortens provider object ids and keeps readable names", () => {
    expect(looksLikeId("39545f73-134e-49ac-9731-0e96df8ea218")).toBe(true);
    expect(looksLikeId("00g1a2b3c4d5e6f7g8h9")).toBe(true);

    expect(looksLikeId("Genie Administrators")).toBe(false);
    expect(looksLikeId("engineering-team-2024-backend")).toBe(false);
    expect(looksLikeId("administratorsofthetenant")).toBe(false);
  });
});

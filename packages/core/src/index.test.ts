import { describe, expect, it } from "vitest";

describe("the package entrypoint", () => {
  it("loads without a side effect", async () => {
    await expect(import("./index.ts")).resolves.toBeDefined();
  });
});

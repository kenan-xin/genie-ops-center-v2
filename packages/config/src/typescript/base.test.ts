import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = JSON.parse(readFileSync(new URL("./base.json", import.meta.url), "utf8")) as {
  compilerOptions: Record<string, unknown>;
};

describe("the shared TypeScript preset", () => {
  it("turns strict mode on", () => {
    expect(base.compilerOptions.strict).toBe(true);
  });

  it("rejects unchecked index access, which hides an undefined value behind a typed read", () => {
    expect(base.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it("emits nothing, because every package typechecks and does not build through tsc", () => {
    expect(base.compilerOptions.noEmit).toBe(true);
  });
});

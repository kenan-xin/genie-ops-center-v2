import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface CompilerOptions {
  readonly [key: string]: boolean | number | string | undefined;
}

// SAFETY: the file is read from the package itself, so the parsed JSON is the
// committed preset and the asserted shape is the one checked into the repository.
const base = JSON.parse(readFileSync(new URL("./base.json", import.meta.url), "utf8")) as {
  compilerOptions: CompilerOptions;
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

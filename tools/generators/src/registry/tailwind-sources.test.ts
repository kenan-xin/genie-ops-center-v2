import { describe, expect, it } from "vitest";

import { moduleSourceLines } from "./tailwind-sources.ts";

describe("moduleSourceLines", () => {
  it("scans only the src folder of each selected module, joined to the base", () => {
    expect(
      moduleSourceLines("../../../..", [
        "packages/modules/beta",
        "packages/modules/alpha",
      ])
    ).toBe(
      '@source "../../../../packages/modules/beta/src";\n' +
        '@source "../../../../packages/modules/alpha/src";\n'
    );
  });

  it("quotes a path that holds a space or a quote, so the line still parses", () => {
    expect(moduleSourceLines('/a b/"c', ["packages/modules/alpha"])).toBe(
      '@source "/a b/\\"c/packages/modules/alpha/src";\n'
    );
  });

  it("writes no line for an empty selection", () => {
    expect(moduleSourceLines("..", [])).toBe("");
  });
});

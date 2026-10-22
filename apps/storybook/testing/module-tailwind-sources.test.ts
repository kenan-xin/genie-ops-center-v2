import { describe, expect, it } from "vitest";

import { moduleTailwindSources } from "../.storybook/module-tailwind-sources.ts";

const STYLESHEET = "/repo/apps/storybook/.storybook/preview.css";

function transform(
  id: string,
  moduleRoots: readonly string[]
): string | undefined {
  const plugin = moduleTailwindSources({
    stylesheet: STYLESHEET,
    // `main.ts` builds this text with `moduleSourceLines`, tested in tools/generators.
    lines: moduleRoots.map((root) => `@source "/repo/${root}/src";\n`).join(""),
  });

  // SAFETY: the plugin declares `transform` as a plain function that returns
  // text or nothing, and it never reads the Vite plugin context the test omits.
  const hook = plugin.transform as (
    code: string,
    id: string
  ) => string | undefined;

  return hook("@import 'x';", id);
}

describe("the module Tailwind sources", () => {
  it("scans only the selected modules, also when Vite adds a query", () => {
    expect(
      transform(`${STYLESHEET}?direct`, ["packages/modules/placeholder"])
    ).toBe(
      "@import 'x';\n@source \"/repo/packages/modules/placeholder/src\";\n"
    );
    expect(transform(STYLESHEET, [])).toBe("@import 'x';\n");
  });

  it("leaves every other stylesheet untouched", () => {
    expect(
      transform("/repo/packages/ui/src/other.css", [
        "packages/modules/placeholder",
      ])
    ).toBeUndefined();
  });
});

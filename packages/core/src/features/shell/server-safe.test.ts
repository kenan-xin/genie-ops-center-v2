import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The app home page renders NoGrantsEmptyState on the server and calls buttonVariants() there. A
// "use client" file turns that call into a Next build/runtime error, so the file must stay plain.
describe("server-rendered shell", () => {
  it("keeps buttonVariants out of a use-client file", () => {
    const source = readFileSync(
      new URL(
        "../../../../ui/src/components/button-variants.ts",
        import.meta.url
      ),
      "utf8"
    );

    expect(source).not.toMatch(/^\s*["']use client["']/m);
    expect(source).toContain("export { buttonVariants }");
  });
});

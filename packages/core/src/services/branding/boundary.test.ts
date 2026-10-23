import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Publish makes no Keycloak admin call (R-45, AC-5): no file of the branding service imports a
 * path that names Keycloak, so `applyBranding` can reach the branding row only.
 */
describe("the branding service boundary", () => {
  it("imports nothing that names keycloak", () => {
    const directory = new URL(".", import.meta.url);

    const imports = readdirSync(directory)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .flatMap((name) =>
        [
          ...readFileSync(new URL(name, directory), "utf8").matchAll(
            /from "([^"]+)"/g
          ),
        ].map((match) => match[1] ?? "")
      );

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((path) => /keycloak/i.test(path))).toEqual([]);
  });
});

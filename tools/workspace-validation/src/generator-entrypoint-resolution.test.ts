import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

const GENERATORS_ROOT = join(WORKSPACE_ROOT, "tools/generators");

const GENERATORS_MANIFEST = join(GENERATORS_ROOT, "package.json");

const STORYBOOK_CONSUMER_ROOT = join(
  WORKSPACE_ROOT,
  "apps/storybook/.storybook"
);

type GeneratorsManifest = {
  readonly exports?: { readonly ".": string };
};

describe("the @genie/generators entrypoint", () => {
  it("declares its selection barrel in the real exports map", () => {
    // SAFETY: this is the repository's own tracked manifest; the exact
    // mapping and the existence of its target are asserted right here.
    const manifest = JSON.parse(
      readFileSync(GENERATORS_MANIFEST, "utf8")
    ) as GeneratorsManifest;

    expect(manifest.exports?.["."]).toBe("./src/selection/index.ts");
    expect(existsSync(join(GENERATORS_ROOT, "src/selection/index.ts"))).toBe(
      true
    );
  });

  it("reaches the barrel by package specifier from the real consuming host", () => {
    const resolved = createRequire(
      join(STORYBOOK_CONSUMER_ROOT, "main.ts")
    ).resolve("@genie/generators");

    expect(resolved).toBe(join(GENERATORS_ROOT, "src/selection/index.ts"));
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, probe } from "./__testing__/target-probe.ts";

const TSC = join(WORKSPACE_ROOT, "node_modules/.bin/tsc");

const DOM_USE = `export const probe = document.title;\n`;

const CORE_ROOT = join(WORKSPACE_ROOT, "packages/core");

/**
 * The committed configuration with `extends` rewritten to an absolute path, so
 * the fixture compiles under the real options and keeps following the committed
 * files when they change. Only `extends` is touched; it is relative to the
 * committed file's own directory, which does not exist inside the fixture.
 */
function readConfig(relativePath: string, extendsTarget: string): string {
  const config: { extends: string } = JSON.parse(
    readFileSync(join(CORE_ROOT, relativePath), "utf8")
  );

  config.extends = extendsTarget;

  return JSON.stringify(config);
}

describe("the core server program", () => {
  it("rejects a browser global under a server path", () => {
    const result = probe(
      [
        {
          path: "package.json",
          // NodeNext treats .ts files as CommonJS without this, and the probe
          // then fails on module syntax instead of on the browser global.
          source: `{\n  "type": "module"\n}\n`,
        },
        {
          path: "tsconfig.json",
          source: readConfig(
            "tsconfig.json",
            join(WORKSPACE_ROOT, "tsconfig.base.json")
          ),
        },
        { path: "src/services/dom-probe.ts", source: DOM_USE },
      ],
      TSC,
      ["--noEmit", "-p", "tsconfig.json"]
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("dom-probe.ts");
  });
});

describe("the core browser program", () => {
  it("accepts the same browser global under the story seam", () => {
    const result = probe(
      [
        {
          path: "package.json",
          source: `{\n  "type": "module"\n}\n`,
        },
        {
          path: "tsconfig.json",
          source: readConfig(
            "tsconfig.browser.json",
            join(CORE_ROOT, "tsconfig.json")
          ),
        },
        { path: "src/lib/story-seam/dom-probe.tsx", source: DOM_USE },
      ],
      TSC,
      ["--noEmit", "-p", "tsconfig.json"]
    );

    expect(result.failed).toBe(false);
  });
});

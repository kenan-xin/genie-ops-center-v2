import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * A consumer outside this package, so the import goes through the package name and the
 * manifest's `exports` field rather than through a file path. The manifest test beside this
 * one proves what each entry file exports; this one proves that the names resolve to them.
 *
 * The consumer is a throwaway directory holding one symlink to this package. It is not the
 * app: R-20's harness owns the composed proof, and nothing here touches it.
 */
const PACKAGE_ROOT = join(import.meta.dirname, "..");

let consumer = "";

beforeEach(() => {
  consumer = mkdtempSync(join(tmpdir(), "placeholder-consumer-"));

  mkdirSync(join(consumer, "node_modules", "@genie"), { recursive: true });

  symlinkSync(
    PACKAGE_ROOT,
    join(consumer, "node_modules", "@genie", "module-placeholder")
  );

  // The package's own dependencies resolve upward from its real location, so the consumer
  // needs nothing beyond the link and a manifest of its own.
  writeFileSync(
    join(consumer, "package.json"),
    `{\n  "type": "module"\n}\n`,
    "utf8"
  );
});

afterEach(() => {
  rmSync(consumer, { recursive: true, force: true });
});

/** Runs one line of code in the throwaway consumer and answers what it printed. */
function runInConsumer(source: string): string {
  writeFileSync(join(consumer, "entry.ts"), source, "utf8");

  return execFileSync(
    process.execPath,
    ["--experimental-strip-types", "entry.ts"],
    { cwd: consumer, encoding: "utf8" }
  ).trim();
}

describe("resolution by package name", () => {
  // The consumer resolves rather than imports. Node's type stripping does not read `.tsx`, and
  // the declaration reaches page components, so a plain node process cannot load the graph. A
  // resolution answers the question this test owns: where does the name land. What that file
  // exports is the manifest test beside this one, and the two together are the proof.
  it("resolves @genie/module-placeholder to the declared entry file", () => {
    const resolved = runInConsumer(
      `console.log(import.meta.resolve("@genie/module-placeholder"));\n`
    );

    expect(resolved.endsWith("/src/index.ts")).toBe(true);
  });

  it("resolves the presentation subpath to its own entry file", () => {
    const resolved = runInConsumer(
      `console.log(import.meta.resolve("@genie/module-placeholder/presentation"));\n`
    );

    expect(resolved.endsWith("/src/presentation/index.ts")).toBe(true);
  });

  it("exposes no subpath the manifest does not declare", () => {
    expect(() =>
      runInConsumer(`import "@genie/module-placeholder/src/router.ts";\n`)
    ).toThrow();
  });
});

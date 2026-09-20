import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, lintAt, withFixture } from "./lint-at.ts";

const FIXTURE = "packages/ui/__boundary__/__boundary.ts";

const SOURCE = "export const fixture = true;\n";

let root = "";

beforeEach(() => {
  // Every case runs against its own disposable root, never the repository tree,
  // so a refused fixture cannot leave a file behind in the checkout.
  root = mkdtempSync(join(tmpdir(), "lint-at-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes a file that the invocation under test did not create. */
function place(relativePath: string, content: string): string {
  const absolute = join(root, relativePath);

  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");

  return absolute;
}

describe("the fixture lifecycle", () => {
  it("removes the fixture and every directory it created", () => {
    const result = withFixture(root, FIXTURE, SOURCE, () => "ran");

    expect(result).toBe("ran");
    expect(existsSync(join(root, FIXTURE))).toBe(false);
    expect(existsSync(join(root, "packages"))).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  it("removes the fixture when the body fails, which is what a broken lint looks like", () => {
    expect(() =>
      withFixture(root, FIXTURE, SOURCE, () => {
        throw new Error("oxlint could not start");
      })
    ).toThrow("oxlint could not start");

    expect(existsSync(join(root, FIXTURE))).toBe(false);
    expect(existsSync(join(root, "packages"))).toBe(false);
  });

  it("keeps a pre-existing file byte-identical instead of overwriting it", () => {
    const sentinel = "export const sentinel = true;\n";
    const absolute = place(FIXTURE, sentinel);

    expect(() => withFixture(root, FIXTURE, SOURCE, () => "ran")).toThrow(
      "EEXIST"
    );

    expect(readFileSync(absolute, "utf8")).toBe(sentinel);
  });

  it("refuses a symlink at the fixture path and never follows it", () => {
    const target = place("outside.ts", SOURCE);
    const absolute = join(root, FIXTURE);

    mkdirSync(dirname(absolute), { recursive: true });
    symlinkSync(target, absolute);

    expect(() => withFixture(root, FIXTURE, SOURCE, () => "ran")).toThrow(
      "EEXIST"
    );

    expect(lstatSync(absolute).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(SOURCE);
  });

  it("keeps unrelated content that appeared inside a directory it created", () => {
    const result = withFixture(root, FIXTURE, SOURCE, () => {
      place("packages/ui/scout.ts", SOURCE);

      return "ran";
    });

    expect(result).toBe("ran");
    expect(existsSync(join(root, FIXTURE))).toBe(false);
    expect(existsSync(join(root, "packages/ui/__boundary__"))).toBe(false);
    expect(existsSync(join(root, "packages/ui/scout.ts"))).toBe(true);
  });

  it("refuses when an ancestor of the fixture path is a file", () => {
    const blocker = place("packages", "not a directory\n");

    expect(() => withFixture(root, FIXTURE, SOURCE, () => "ran")).toThrow();

    expect(readFileSync(blocker, "utf8")).toBe("not a directory\n");
  });

  it("refuses a path that escapes its root", () => {
    expect(() =>
      withFixture(root, "../escape.ts", SOURCE, () => "ran")
    ).toThrow("inside its root");
  });
});

describe("lintAt through the hardened lifecycle", () => {
  it("removes the fixture and its directory after a lint run that fails", () => {
    // No other suite uses this path, and the process id keeps two workers apart,
    // so this invocation is the only possible owner of the directory it removes.
    const relativePath = `packages/config/__wiring__-${process.pid}/__wiring__.ts`;
    const result = lintAt(relativePath, `import "pg";\n`);

    expect(result.failed).toBe(true);
    expect(result.output).toContain(
      "config opens no database connection (DEC-34)."
    );
    expect(existsSync(join(WORKSPACE_ROOT, dirname(relativePath)))).toBe(false);
  });
});

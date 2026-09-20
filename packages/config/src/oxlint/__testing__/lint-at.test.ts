import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ISOLATED_ROOT_PREFIX,
  WORKSPACE_ROOT,
  lintAt,
  lintAtIsolated,
  withFixture,
} from "./lint-at.ts";

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

/**
 * The temporary roots this process left behind. Scoped by process id, because a
 * parallel worker running the boundary suite creates roots of its own, and an
 * unscoped count would swing between the reading before and the one after.
 */
function strayRoots(): string[] {
  return readdirSync(tmpdir()).filter((entry) =>
    entry.startsWith(ISOLATED_ROOT_PREFIX)
  );
}

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

// A path the product owns is the case `lintAt` cannot serve, by design: it
// refuses an existing file rather than overwrite one. The isolated root is how
// a rule keyed to such a path is still reachable from a test.
describe("lintAtIsolated over a path the checkout already owns", () => {
  // A real application source file today, and an app-layer path, so the rule it
  // reaches is a production one rather than one invented for this test.
  const OWNED = "apps/genie/src/index.ts";

  it("refuses the same path through lintAt, which is why the isolated root exists", () => {
    // Asserted first, so that a rename of the real file blames the rename rather
    // than looking like the refusal stopped working.
    expect(existsSync(join(WORKSPACE_ROOT, OWNED))).toBe(true);

    expect(() => lintAt(OWNED, SOURCE)).toThrow("EEXIST");
  });

  it("reaches the app restriction and leaves the real file byte-identical", () => {
    const absolute = join(WORKSPACE_ROOT, OWNED);
    const before = readFileSync(absolute, "utf8");

    const result = lintAtIsolated(OWNED, `import "pg";\n`);

    expect(result.failed).toBe(true);
    expect(result.output).toContain("an app opens no connection (DEC-34).");
    expect(readFileSync(absolute, "utf8")).toBe(before);
  });

  it("removes its temporary root and leaves the checkout's anchors in place", () => {
    const before = strayRoots();

    lintAtIsolated(OWNED, SOURCE);

    expect(strayRoots()).toEqual(before);

    // The anchors are symlinks into the checkout. A recursive removal that
    // followed one would take the real tree, so this is the guard on that.
    expect(existsSync(join(WORKSPACE_ROOT, "oxlint.config.ts"))).toBe(true);
    expect(
      existsSync(join(WORKSPACE_ROOT, "packages/config/package.json"))
    ).toBe(true);
    expect(existsSync(join(WORKSPACE_ROOT, "node_modules"))).toBe(true);
  });

  // A guard that compares the raw first segment is bypassed by every spelling
  // below, and each one resolves through an anchor symlink into the checkout.
  const UNDER_AN_ANCHOR = [
    "packages/config/__written__.ts",
    "./packages/config/__written__.ts",
    ".//packages/config/__written__.ts",
    "a/../packages/config/__written__.ts",
    "node_modules/__written__.ts",
    "packages/../oxlint.config.ts",
  ];

  it.each(UNDER_AN_ANCHOR)(
    "refuses %s, which would write into the checkout",
    (candidate) => {
      expect(() => lintAtIsolated(candidate, SOURCE)).toThrow(
        "symlinked anchor"
      );
    }
  );

  it("sees a root named with the prefix the harness creates roots under", () => {
    // Paired with the case below: together they fix what the count means. Without
    // this one, a filter that matched nothing at all would look like clean-up.
    const mine = mkdtempSync(join(tmpdir(), ISOLATED_ROOT_PREFIX));

    try {
      expect(strayRoots()).toContain(basename(mine));
    } finally {
      rmSync(mine, { recursive: true, force: true });
    }
  });

  it("ignores a root belonging to another process, so a parallel worker cannot skew it", () => {
    // The boundary suite runs in its own worker and makes six roots of its own.
    // An unscoped prefix would count them, and the before-and-after comparison
    // would then swing on another worker's timing rather than on cleanup.
    const foreign = join(tmpdir(), `oxlint-boundary-${process.pid + 1}-abc123`);

    mkdirSync(foreign);

    try {
      expect(strayRoots()).not.toContain(basename(foreign));
    } finally {
      rmSync(foreign, { recursive: true, force: true });
    }
  });

  it("refuses an absolute path, which no root can contain", () => {
    expect(() =>
      lintAtIsolated(
        join(WORKSPACE_ROOT, "packages/config/__written__.ts"),
        SOURCE
      )
    ).toThrow("must be relative");
  });

  it("leaves no file in the checkout after the refusals", () => {
    for (const candidate of UNDER_AN_ANCHOR) {
      expect(() => lintAtIsolated(candidate, SOURCE)).toThrow();
    }

    expect(
      existsSync(join(WORKSPACE_ROOT, "packages/config/__written__.ts"))
    ).toBe(false);
    expect(
      existsSync(join(WORKSPACE_ROOT, "node_modules/__written__.ts"))
    ).toBe(false);
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

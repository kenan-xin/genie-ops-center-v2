import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

// R-4 names these trees. Only `customers/<slug>/app/` counts inside customers/.
const SCANNED = [
  "packages/ui",
  "packages/core",
  "packages/modules",
  "apps",
  "customers",
];

const SOURCE = /\.(?:[cm]?[jt]sx?|css|mdx|html)$/;

// The lint suites write these transient fixtures into a real src and delete them again.
const TRANSIENT = /__(?:boundary|wiring|antislop|shadcn)__/;

const CUSTOMER_APP = /^customers\/[^/]+\/app\//;

/**
 * The tokens.md grep as a check. The `shadcn/no-arbitrary-values` lint reads only JSX class
 * strings and helper calls, so a plain class-string constant escapes it; this reads text.
 */
const FORBIDDEN = [
  { rule: "R-4 arbitrary pixel text size", pattern: /text-\[[0-9.]*px\]/ },
  { rule: "R-10 next/font", pattern: /["']next\/font/ },
];

/** One "path:line rule" entry for every line that matches a forbidden pattern. */
function findings(files: ReadonlyMap<string, string>): readonly string[] {
  return [...files].flatMap(([path, text]) =>
    text
      .split("\n")
      .flatMap((line, index) =>
        FORBIDDEN.flatMap(({ rule, pattern }) =>
          pattern.test(line) ? [`${path}:${index + 1} ${rule}`] : []
        )
      )
  );
}

/** Tracked and untracked, unignored source files of the scanned trees, by path. */
function sourceFiles(): ReadonlyMap<string, string> {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...SCANNED,
    ],
    { cwd: WORKSPACE_ROOT, encoding: "utf8" }
  );

  const paths = listed
    .split("\0")
    .filter((path) => SOURCE.test(path) && !TRANSIENT.test(path))
    .filter((path) => !path.startsWith("customers/") || CUSTOMER_APP.test(path))
    .filter((path) => existsSync(join(WORKSPACE_ROOT, path)));

  return new Map(
    paths.map((path) => [
      path,
      readFileSync(join(WORKSPACE_ROOT, path), "utf8"),
    ])
  );
}

describe("the token layer's repository scan", () => {
  it("reports an arbitrary pixel text size and a next/font import, so the scan can fail", () => {
    const samples = new Map([
      ["packages/ui/src/a.tsx", 'className="text-[13.5px]"'],
      ["apps/genie/src/b.tsx", 'import { Inter } from "next/font/google";'],
    ]);

    expect(findings(samples)).toEqual([
      "packages/ui/src/a.tsx:1 R-4 arbitrary pixel text size",
      "apps/genie/src/b.tsx:1 R-10 next/font",
    ]);
  });

  it("finds neither in any source file of the trees R-4 names", () => {
    const files = sourceFiles();

    // The scan must reach the trees it names, or a green run proves nothing.
    expect(files.size).toBeGreaterThan(100);
    expect(findings(files)).toEqual([]);
  });
});

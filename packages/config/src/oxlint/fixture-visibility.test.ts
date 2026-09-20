import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT } from "./__testing__/lint-at.ts";

/**
 * A boundary fixture is a real file, written into the checkout at a path chosen
 * to match one override glob, and removed again. Every project's tsconfig takes
 * `src/**`, so a fixture written under one is visible to `tsc` for as long as it
 * exists. A concurrent `nx run-many -t typecheck test` then fails on a file that
 * is already gone, which is what `genie-ops-center-v2-64a` recorded.
 *
 * The fix is a name, not a location: the suite needs paths inside `src/` to prove
 * the rules that key on them, so the fixtures keep their paths and every project
 * excludes the prefix they share. These cases stop the next fixture from
 * silently reopening the hole.
 *
 * Paths handed to `lintAtIsolated` are not checked here. That helper writes into
 * a throwaway root and never touches the checkout, which is the whole reason it
 * exists.
 */

const EXCLUDED_PREFIXES = ["__boundary__", "__wiring__"];

/** The tsconfig of every project whose typecheck runs beside the suite. */
const TYPECHECKED = [
  "packages/config",
  "packages/core",
  "packages/ui",
  "apps/genie",
  "tools/generators",
];

/** Paths written into the checkout itself, read from the suites' own source. */
function checkoutFixturePaths(): readonly string[] {
  const sources = [
    "packages/config/src/oxlint/boundaries.test.ts",
    "packages/config/src/oxlint/__testing__/lint-at.test.ts",
  ];

  const found = new Set<string>();

  for (const source of sources) {
    const text = readFileSync(join(WORKSPACE_ROOT, source), "utf8");

    // The isolated helper is deliberately excluded by the negative lookahead.
    for (const match of text.matchAll(
      /\blintAt(?!Isolated)\(\s*\n?\s*"([^"]+)"/g
    )) {
      const path = match[1];

      if (path !== undefined) {
        found.add(path);
      }
    }
  }

  return [...found].toSorted();
}

/** Whether a project's tsconfig `include` would pick this path up. */
function isIncludedBy(path: string, project: string): boolean {
  if (path === `${project}/vitest.config.ts`) {
    return true;
  }

  return path.startsWith(`${project}/src/`) && path.endsWith(".ts");
}

/** Whether a path carries a name every tsconfig here excludes. */
function isExcludedByName(path: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => basename(path).startsWith(prefix));
}

/** The exclude list a project applies, its own or the one it inherits. */
function excludeFor(project: string): readonly string[] {
  // SAFETY: the bytes are this repository's own tsconfig files, and the single
  // field read from each is optional and defaulted immediately.
  const own = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, project, "tsconfig.json"), "utf8")
  ) as { exclude?: readonly string[] };

  if (own.exclude !== undefined) {
    return own.exclude;
  }

  // SAFETY: same provenance, the shared base this repository owns.
  const base = JSON.parse(
    readFileSync(
      join(WORKSPACE_ROOT, "packages/config/src/typescript/base.json"),
      "utf8"
    )
  ) as { exclude?: readonly string[] };

  return base.exclude ?? [];
}

describe("boundary fixtures and the typecheck that runs beside them", () => {
  it("finds the fixture paths, so an empty match cannot pass this suite", () => {
    expect(checkoutFixturePaths().length).toBeGreaterThan(20);
  });

  it("finds at least one fixture inside a typechecked src, which is the risk", () => {
    const inside = checkoutFixturePaths().filter((path) =>
      TYPECHECKED.some((project) => isIncludedBy(path, project))
    );

    expect(inside.length).toBeGreaterThan(0);
  });

  it("writes no fixture that a project's typecheck would compile", () => {
    const visible = checkoutFixturePaths().filter(
      (path) =>
        TYPECHECKED.some((project) => isIncludedBy(path, project)) &&
        !isExcludedByName(path)
    );

    expect(visible).toEqual([]);
  });

  it.each(TYPECHECKED)("%s excludes both fixture prefixes", (project) => {
    const exclude = excludeFor(project);

    expect(exclude).toContain("**/__boundary__*");
    expect(exclude).toContain("**/__wiring__*");
  });
});

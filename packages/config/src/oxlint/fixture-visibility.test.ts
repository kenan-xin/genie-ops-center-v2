import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, withFixture } from "./__testing__/lint-at.ts";

/**
 * A lint fixture is a real file, written into the checkout at a path chosen to
 * match one override glob, and removed again. Every project's tsconfig takes
 * `src/**`, so a fixture written under one is visible to `tsc` for as long as it
 * exists. A concurrent `nx run-many -t typecheck test` then compiles a file that
 * is already gone, which is what `genie-ops-center-v2-64a` recorded.
 *
 * The fix is a name, not a location: the suites need paths inside `src/` to prove
 * the rules that key on them, so the fixtures keep their paths and the root
 * tsconfig excludes the prefixes they share.
 *
 * These cases assert the RESOLVED configuration, never the raw JSON text. An
 * earlier version of this file asserted the text and certified a fix that was
 * not in force: the same patterns declared inside
 * `packages/config/src/typescript/base.json` rebase onto that folder and match
 * nothing, because TypeScript resolves a relative path in an inherited config
 * against the directory that declared it.
 *
 * Paths handed to `lintAtIsolated` are not checked. That helper writes into a
 * throwaway root and never touches the checkout.
 */

/** The projects whose typecheck runs beside the suites that write fixtures. */
const TYPECHECKED = [
  "packages/config",
  "packages/core",
  "packages/ui",
  "apps/genie",
  "tools/generators",
];

/** Every suite in this package that writes a fixture into the checkout. */
function fixtureSources(): readonly string[] {
  const root = join(WORKSPACE_ROOT, "packages/config/src/oxlint");

  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => readFileSync(path, "utf8").includes("lintAt"))
    .toSorted();
}

/** Paths written into the checkout itself, read from those suites' source. */
function checkoutFixturePaths(): readonly string[] {
  const found = new Set<string>();

  for (const source of fixtureSources()) {
    const text = readFileSync(source, "utf8");

    // The isolated helper is excluded by the negative lookahead.
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

/** The files a project's resolved configuration hands to the compiler. */
function resolvedFiles(project: string): readonly string[] {
  const raw = execFileSync("pnpm", ["exec", "tsc", "--showConfig"], {
    cwd: join(WORKSPACE_ROOT, project),
    encoding: "utf8",
  });

  // SAFETY: `tsc --showConfig` prints one JSON document, and the one field read
  // below is optional here and asserted non-empty by the caller.
  const config = JSON.parse(raw) as { files?: readonly string[] };

  const files = (config.files ?? []).map((file) =>
    relative(WORKSPACE_ROOT, join(WORKSPACE_ROOT, project, file))
  );

  // An empty list would satisfy every `not.toContain` below and certify nothing,
  // so the absent case fails here rather than passing quietly.
  expect(files.length).toBeGreaterThan(0);

  return files;
}

/** The checkout's own oxlint, the binary the product lint targets run. */
const OXLINT = join(WORKSPACE_ROOT, "node_modules", ".bin", "oxlint");

/**
 * Runs one oxlint invocation the way a lint target does and returns its report,
 * exit code folded into the text so a non-zero run is still readable here.
 */
function lintReport(args: readonly string[]): string {
  try {
    return execFileSync(OXLINT, ["--config", "oxlint.config.ts", ...args], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // SAFETY: execFileSync throws an Error that carries the child's output.
    const failure = error as { stdout?: string; stderr?: string };

    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
}

const COVERED_PREFIXES = ["__boundary__", "__wiring__", "__antislop__"];

/** The real fixture paths a project's own include would take. */
function fixturesInside(project: string): readonly string[] {
  return checkoutFixturePaths().filter((path) => isIncludedBy(path, project));
}

/**
 * Probe paths, one per prefix a project's real fixtures use. Deriving a fresh
 * path rather than reusing a real one matters: the suites that own those paths
 * run in parallel with this one, and writing a path another suite owns would
 * collide with the very fixtures this file exists to protect. The process id
 * keeps two workers apart.
 */
function probesInside(project: string): readonly string[] {
  const prefixes = new Set<string>();

  for (const path of fixturesInside(project)) {
    const prefix = COVERED_PREFIXES.find((candidate) =>
      basename(path).startsWith(candidate)
    );

    if (prefix !== undefined) {
      prefixes.add(prefix);
    }
  }

  return [...prefixes]
    .toSorted()
    .map((prefix) => `${project}/src/${prefix}probe-${process.pid}.ts`);
}

const AT_RISK = TYPECHECKED.filter(
  (project) => fixturesInside(project).length > 0
);

describe("lint fixtures and the typecheck that runs beside them", () => {
  it("finds the suites that write fixtures, so an empty scan cannot pass", () => {
    expect(fixtureSources().length).toBeGreaterThan(1);
    expect(checkoutFixturePaths().length).toBeGreaterThan(20);
  });

  it("finds fixtures inside a typechecked src, which is the whole risk", () => {
    expect(AT_RISK.length).toBeGreaterThan(1);
  });

  // The load-bearing case. It writes the fixture, asks the compiler what it
  // would compile, and fails if the fixture is in the answer.
  it.each(AT_RISK)(
    "%s compiles no fixture it would otherwise include",
    (project) => {
      const probes = probesInside(project);

      expect(probes.length).toBeGreaterThan(0);

      for (const probe of probes) {
        withFixture(
          WORKSPACE_ROOT,
          probe,
          "export const probe = true;\n",
          () => {
            expect(resolvedFiles(project)).not.toContain(probe);
          }
        );
      }
    }
  );

  it.each(checkoutFixturePaths())(
    "%s is named so that one shared prefix covers it",
    (path) => {
      const name = basename(path);

      const covered = COVERED_PREFIXES.some((prefix) =>
        name.startsWith(prefix)
      );

      // A fixture outside every typechecked `src/` cannot race, so it is free to
      // carry any name. One inside must be covered by a prefix.
      const atRisk = TYPECHECKED.some((project) => isIncludedBy(path, project));

      expect(covered || !atRisk).toBe(true);
    }
  );
});

describe("lint fixtures and the lint that runs beside them", () => {
  // The lint counterpart of the typecheck race above. A directory scan over a
  // project's `src` lists a fixture the suites wrote and already removed, then
  // fails to open it. The root `.eslintignore` excludes the shared prefixes, and
  // the harness lints an explicit fixture path with `--no-ignore`, so the rules
  // are still exercised.
  it("keeps a transient fixture out of a directory scan, and still lints it on request", () => {
    const probe = `packages/core/src/__boundary__probe-${process.pid}.ts`;

    withFixture(
      WORKSPACE_ROOT,
      probe,
      `import "@genie/module-placeholder";\n`,
      () => {
        const scanned = lintReport(["packages/core/src"]);

        expect(scanned).not.toContain(probe);

        // The same file, named explicitly with ignores off, is a real violation,
        // so the scan above excludes it rather than finding nothing to report.
        const explicit = lintReport(["--no-ignore", probe]);

        expect(explicit).toContain("core never imports a module");
      }
    );
  });
});

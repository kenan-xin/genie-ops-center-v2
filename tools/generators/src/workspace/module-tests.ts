import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * R-41: continuous integration must fail a module package that ships no tests.
 *
 * The check is a data-only walk of the package for a test file its own test
 * target would collect. It reads bytes and names; it never imports or evaluates
 * a module declaration. Keeping it a pure function lets the hygiene suite run it
 * over the real modules and lets this module's own suite prove the failure path
 * against a disposable package that has no test.
 */

const TEST_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
] as const;

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".nx",
  "dist",
  "coverage",
  "storybook-static",
  "test-results",
  "playwright-report",
]);

/** Every test file a module's own targets would collect, repository-relative. */
export function moduleTestFiles(
  projectRoot: string,
  workspaceRoot: string
): readonly string[] {
  const files: string[] = [];

  const walk = (relative: string): void => {
    let entries;

    try {
      entries = readdirSync(join(workspaceRoot, relative), {
        withFileTypes: true,
      });
    } catch {
      // A project root that does not exist yet has no tests; the caller's
      // naming check reports the missing package, so this stays quiet.
      return;
    }

    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;

      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(child);
        continue;
      }

      if (TEST_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
        files.push(child);
      }
    }
  };

  walk(projectRoot);

  return files;
}

/**
 * One sentence naming that the module ships no tests, or `undefined` when it
 * ships at least one. A module package with a `test` script but no test file
 * still fails here, because the script alone would collect nothing and report a
 * green run.
 */
export function moduleTestsError(
  projectRoot: string,
  workspaceRoot: string
): string | undefined {
  const files = moduleTestFiles(projectRoot, workspaceRoot);

  if (files.length === 0) {
    return `${projectRoot} ships no test file; every module package must own at least one unit, integration or browser test (R-41)`;
  }

  return undefined;
}

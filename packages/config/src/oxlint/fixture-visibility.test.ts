import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { UNIT_TEST_EXCLUDE } from "../vitest/unit.ts";
import {
  OXLINT_BASE_ARGS,
  WORKSPACE_ROOT,
  withFixture,
} from "./__testing__/lint-at.ts";

/**
 * A lint fixture is a real file, written into the checkout at a path chosen to
 * match one override glob, and removed again. Every project's tsconfig takes
 * `src/**`, so a fixture written under one is visible to `tsc` for as long as it
 * exists. A concurrent `nx run-many -t typecheck test` then compiles a file that
 * is already gone, which is what `genie-ops-center-v2-64a` recorded.
 *
 * The fix is a name, not a location: the suites need paths inside `src/` to prove
 * the rules that key on them, so the fixtures keep their paths and every
 * exclusion surface (root tsconfig, `.eslintignore`, oxfmt's `ignorePatterns`
 * and the shared Vitest preset) drops the markers they share.
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
function resolvedFiles(
  project: string,
  tsconfig = "tsconfig.json"
): readonly string[] {
  const raw = execFileSync(
    "pnpm",
    ["exec", "tsc", "-p", tsconfig, "--showConfig"],
    {
      cwd: join(WORKSPACE_ROOT, project),
      encoding: "utf8",
    }
  );

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
    return execFileSync(OXLINT, [...OXLINT_BASE_ARGS, ...args], {
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

/** The checkout's own vitest, the binary every project's `test` target runs. */
const VITEST = join(WORKSPACE_ROOT, "node_modules", ".bin", "vitest");

/**
 * Runs the checkout's own vitest in `list` mode over one project and returns the
 * collected specs. Collection is the surface under test: a project's resolved
 * `include`/`exclude` decides which files a run would import, and this reads
 * that decision from the real binary rather than re-deriving it.
 */
function vitestList(project: string): string {
  return execFileSync(VITEST, ["list"], {
    cwd: join(WORKSPACE_ROOT, project),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The checkout's own oxfmt, the binary `pnpm format:check` runs. */
const OXFMT = join(WORKSPACE_ROOT, "node_modules", ".bin", "oxfmt");

/** The one formatter configuration, passed explicitly so `cwd` cannot vary it. */
const OXFMT_CONFIG = join(WORKSPACE_ROOT, "oxfmt.config.ts");

/**
 * Runs one oxfmt check over the given paths from `cwd` and returns its report,
 * exit code folded into the text so a non-zero run is still readable here. The
 * config is named, not discovered, so a caller in a disposable root checks that
 * root against the repository's real ignore rules.
 */
function formatReport(cwd: string, paths: readonly string[]): string {
  try {
    return execFileSync(
      OXFMT,
      ["--check", "--disable-nested-config", "-c", OXFMT_CONFIG, ...paths],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    // SAFETY: execFileSync throws an Error that carries the child's output.
    const failure = error as { stdout?: string; stderr?: string };

    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
}

const COVERED_MARKERS = ["__boundary__", "__wiring__", "__antislop__"];

/**
 * The two basename shapes a covered fixture takes. A suite may lead the name
 * with the marker (`__boundary__.test.ts`) or place it mid-basename
 * (`vitest.__boundary__.config.ts`), and every ignore surface matches the
 * marker anywhere inside a path segment. Both shapes are probed, so neither a
 * leading-marker-only nor a containment-only pattern can pass here.
 */
function probeNames(marker: string): readonly string[] {
  return [
    `${marker}probe-${process.pid}.ts`,
    `probe-${process.pid}.${marker}.test.ts`,
  ];
}

/**
 * Holds one transient probe under the checkout for the length of `read`, then
 * removes it. The traversal under test has to read the file inside the window a
 * racing suite leaves open, so the fixture is alive for exactly the body and
 * gone by the time the next assertion runs.
 */
function withProbe<T>(path: string, source: string, read: () => T): T {
  return withFixture(WORKSPACE_ROOT, path, source, read);
}

/**
 * A body oxfmt always reports: the config requires semicolons and collapses the
 * spacing, so any path carrying it is a certain diff.
 */
const UNTIDY_SOURCE = "const   untidy   =   1\n";

/** The real fixture paths a project's own include would take. */
function fixturesInside(project: string): readonly string[] {
  return checkoutFixturePaths().filter((path) => isIncludedBy(path, project));
}

/**
 * Probe paths, one per marker a project's real fixtures use, in both basename
 * shapes. Deriving a fresh path rather than reusing a real one matters: the
 * suites that own those paths run in parallel with this one, and writing a path
 * another suite owns would collide with the very fixtures this file exists to
 * protect. The process id keeps two workers apart.
 */
function probesInside(project: string): readonly string[] {
  const markers = new Set<string>();

  for (const path of fixturesInside(project)) {
    const marker = COVERED_MARKERS.find((candidate) =>
      basename(path).includes(candidate)
    );

    if (marker !== undefined) {
      markers.add(marker);
    }
  }

  return [...markers]
    .toSorted()
    .flatMap((marker) =>
      probeNames(marker).map((name) => `${project}/src/${name}`)
    );
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
        withProbe(probe, "export const probe = true;\n", () => {
          expect(resolvedFiles(project)).not.toContain(probe);
        });
      }
    }
  );

  // A second tsconfig in a typechecked project is a second compiler surface.
  // `next build` type-checks through the app's build tsconfig (pg4), and a
  // project's own `exclude` replaces the inherited one, so it must repeat the
  // markers itself.
  it.each([["apps/genie", "tsconfig.build.json"]])(
    "%s %s compiles no fixture it would otherwise include",
    (project, tsconfig) => {
      const probes = probesInside(project);

      expect(probes.length).toBeGreaterThan(0);

      for (const probe of probes) {
        withProbe(probe, "export const probe = true;\n", () => {
          expect(resolvedFiles(project, tsconfig)).not.toContain(probe);
        });
      }
    }
  );

  it.each(checkoutFixturePaths())(
    "%s is named so that one shared marker covers it",
    (path) => {
      const name = basename(path);

      const covered = COVERED_MARKERS.some((marker) => name.includes(marker));

      // A fixture outside every typechecked `src/` cannot race, so it is free to
      // carry any name. One inside must be covered by a marker.
      const atRisk = TYPECHECKED.some((project) => isIncludedBy(path, project));

      expect(covered || !atRisk).toBe(true);
    }
  );
});

describe("lint fixtures and the lint that runs beside them", () => {
  // The lint counterpart of the typecheck race above. A directory scan over a
  // project's `src` lists a fixture the suites wrote and already removed, then
  // fails to open it. The root `.eslintignore` excludes the shared markers, and
  // the harness lints an explicit fixture path with `--no-ignore`, so the rules
  // are still exercised. The probe is mid-basename, the shape a name such as
  // `vitest.__boundary__.config.ts` takes and the one a leading-marker-only
  // pattern misses.
  it.each(COVERED_MARKERS)(
    "keeps a mid-basename %s fixture out of a directory scan, and still lints it on request",
    (marker) => {
      const probe = `packages/core/src/probe-${process.pid}.${marker}.test.ts`;

      withProbe(probe, `import "@genie/module-placeholder";\n`, () => {
        const scanned = lintReport(["packages/core/src"]);

        expect(scanned).not.toContain(probe);

        // The same file, named explicitly with ignores off, is a real violation,
        // so the scan above excludes it rather than finding nothing to report.
        const explicit = lintReport(["--no-ignore", probe]);

        expect(explicit).toContain("core never imports a module");
      });
    }
  );

  // The app's lint command is the one target that named files by shell glob, so
  // a fixture present when the shell expanded the glob was handed to oxlint and
  // could vanish before oxlint opened it (genie-ops-center-v2-7lj). The command
  // must name its config files, so it can never receive a transient fixture.
  it("never hands a transient fixture to the app lint command", () => {
    // SAFETY: `apps/genie/package.json` is a package manifest, and the
    // assertion below fails loudly when its lint script is absent.
    const manifest = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "apps/genie/package.json"), "utf8")
    ) as { readonly scripts: { readonly lint: string } };

    // The config flag is named separately so the rest of the command, globs and
    // all, is what the shell expands below.
    const command = manifest.scripts.lint.replace(
      /^\S+\s+--config\s+\S+\s+/,
      ""
    );

    // A fresh, process-scoped path: the boundary suite owns
    // `apps/genie/__boundary__.config.ts`, and reusing it here would race that
    // suite's exclusive create under parallel collection.
    const probe = `apps/genie/__boundary__probe-${process.pid}.config.ts`;

    withProbe(probe, "export const probe = true;\n", () => {
      const expanded = execFileSync("sh", ["-c", `printf '%s\\n' ${command}`], {
        cwd: join(WORKSPACE_ROOT, "apps/genie"),
        encoding: "utf8",
      });

      expect(expanded).not.toContain("__boundary__");
    });
  });

  // The unit collection is the vitest face of the same race: a fixture written
  // into a package's `src` matches `src/**/*.test.ts`, so a concurrent unit run
  // would import a file the suites already deleted. The shared preset excludes
  // the markers every suite uses, anywhere inside a path segment
  // (genie-ops-center-v2-7lj).
  it("keeps the transient fixture markers out of the unit collection", () => {
    for (const marker of COVERED_MARKERS) {
      expect(UNIT_TEST_EXCLUDE).toContain(`**/*${marker}*`);
    }
  });

  // The load-bearing case, read from the real binary: a mid-basename,
  // test-shaped fixture is written, the project is asked what it would collect,
  // and the fixture must be absent while a tracked test beside it still appears.
  it.each(COVERED_MARKERS)(
    "collects no mid-basename %s fixture when the project is listed",
    (marker) => {
      const probe = `src/probe-${process.pid}.${marker}.test.ts`;

      withProbe(
        `packages/core/${probe}`,
        `import { it } from "vitest";\n\nit("probe", () => {});\n`,
        () => {
          const listing = vitestList("packages/core");

          expect(listing).not.toContain(probe);

          // The run collected the tracked tests beside the probe, so the absence
          // above is an exclusion and not an empty collection.
          expect(listing).toContain("src/lib/build-safety/index.test.ts");
        }
      );
    },
    // `vitest list` starts a whole second vitest process, and the default 5s
    // does not cover it on a shared two-core runner. The ceiling is named here
    // rather than raised globally, so only this load-bearing case waits longer.
    30_000
  );
});

/** The app's own Playwright, the binary its end-to-end targets run. */
const PLAYWRIGHT = join(
  WORKSPACE_ROOT,
  "apps/genie/node_modules/.bin/playwright"
);

/**
 * The specs the ordinary app configuration would collect. `--list` resolves the
 * configuration's `testDir`, `testMatch` and `testIgnore` and runs no test and no
 * global setup, so it reads the collection decision without a server.
 */
function playwrightList(): string {
  return execFileSync(
    PLAYWRIGHT,
    ["test", "--config", "playwright.config.ts", "--list"],
    {
      cwd: join(WORKSPACE_ROOT, "apps/genie"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
}

describe("lint fixtures and the end-to-end collection that runs beside them", () => {
  // The Playwright face of the same race. The boundary suite writes a
  // test-shaped fixture under `apps/genie/e2e/`, the ordinary configuration's
  // `testDir`, so a `playwright test` run beside it would import a file the
  // suite already deleted (genie-ops-center-v2-hlu).
  it.each(COVERED_MARKERS)(
    "collects no %s fixture in the ordinary configuration",
    (marker) => {
      const probe = `probe-${process.pid}.${marker}.spec.ts`;

      withProbe(
        `apps/genie/e2e/${probe}`,
        `import { test } from "@playwright/test";\n\ntest("probe", () => {});\n`,
        () => {
          const listing = playwrightList();

          expect(listing).not.toContain(probe);

          // A tracked spec beside the probe is still collected, so the absence
          // above is an exclusion and not an empty collection.
          expect(listing).toContain("security-headers.spec.ts");
        }
      );
    }
  );
});

describe("lint fixtures and the formatter that runs beside them", () => {
  // The formatter face of the same race. `format:check` walks the workspace and
  // reads every file it matches, so a fixture present when it runs is formatted
  // as if it were source. The anti-slop suite's chained-assertion body is not
  // oxfmt-clean, so a check overlapping it fails on the fixture itself
  // (genie-ops-center-v2-bew). The root `ignorePatterns` exclude the shared
  // markers, so the walk never reaches one.
  // Every marker is probed, not one representative: each is a separate entry in
  // the ignore list, and dropping any single one would let that suite's fixture
  // back into the walk. A shared `__boundary__` probe alone would stay green
  // with `__antislop__` removed, which is the one whose body the formatter
  // rejects (genie-ops-center-v2-bew).
  //
  // Every basename shape is probed too. A fixture may lead with the marker or
  // carry it mid-basename (`vitest.__boundary__.config.ts`), and a
  // leading-marker-only ignore entry misses the second while a containment entry
  // covers both (genie-ops-center-v2-5hq).
  it.each(COVERED_MARKERS)(
    "keeps a %s fixture out of the format check",
    (marker) => {
      // Fresh, process-scoped paths: the boundary suite owns the fixed names
      // (`packages/core/src/__boundary__.ts`, `packages/core/vitest.__boundary__.config.ts`),
      // and reusing one here would race that suite's exclusive create under
      // parallel collection. Each name still carries the marker under test.
      const excluded = [
        // Leading-marker and mid-basename, test-shaped, inside a package `src`:
        // the shapes a suite writes there.
        ...probeNames(marker).map((name) => `packages/core/src/${name}`),
        // Config-shaped, at the package root: the shape the boundary suite uses
        // to exercise the `*.config.ts` override globs.
        `packages/core/vitest.${marker}probe-${process.pid}.config.ts`,
      ];

      for (const path of excluded) {
        withProbe(path, UNTIDY_SOURCE, () => {
          const report = formatReport(WORKSPACE_ROOT, ["packages/core"]);

          expect(report).not.toContain(path);

          // The walk reached the tracked files beside the probe, so the absence
          // above is an exclusion and not an empty selection.
          expect(report).toContain("correct format");
        });
      }
    }
  );

  // The pair to the case above: the same body at a path no marker covers is
  // reported, so the case above proves the exclusion rather than proving the
  // formatter read nothing. The path is disposable rather than a real one: a
  // non-marked misformatted file in the checkout would itself be the race this
  // guard exists to stop.
  it("reports the same body when no marker covers it, so the exclusion is what hides it", () => {
    const root = mkdtempSync(join(tmpdir(), "oxfmt-visible-"));

    try {
      writeFileSync(join(root, "untidy.ts"), UNTIDY_SOURCE, "utf8");

      expect(formatReport(root, ["."])).toContain("untidy.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The exclusion may only cover names no real file carries. This is the guard
  // on that: a tracked file matching a covered marker would vanish from the
  // formatter, and the case above would not notice. The whole path is checked,
  // not just the basename, because a matching directory hides everything under
  // it, including a file whose own name carries no marker. The marker is matched
  // anywhere inside a segment, which is what a containment pattern excludes.
  it("covers no tracked file, so the fixture markers hide no source", () => {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter((path) =>
        path
          .split("/")
          .some((segment) =>
            COVERED_MARKERS.some((marker) => segment.includes(marker))
          )
      );

    expect(tracked).toEqual([]);
  });
});

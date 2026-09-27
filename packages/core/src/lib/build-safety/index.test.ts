import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeFeatureGraph } from "../../__testing__/feature-import-graph.ts";
import { WORKSPACE_ROOT, probe } from "../../__testing__/target-probe.ts";

const NODE = process.execPath;

const PRELOAD = join(
  WORKSPACE_ROOT,
  "packages/core/src/lib/build-safety/detect-initialization.ts"
);

// pnpm links dependencies per package, so each probe borrows the node_modules its
// entry resolves from: pg links into core, @genie/core links into the app.
const CORE_MODULES = join(WORKSPACE_ROOT, "packages/core/node_modules");

const APP_MODULES = join(WORKSPACE_ROOT, "apps/genie/node_modules");

const PACKAGE = `{\n  "type": "module"\n}\n`;

type Report = {
  readonly resolved: readonly string[];

  readonly connections: readonly string[];
};

type Manifest = { readonly exports: Record<string, string> };

function runProbe(
  entrySource: string,
  nodeModulesRoot: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const result = probe(
    [
      { path: "package.json", source: PACKAGE },

      { path: "entry.ts", source: entrySource },
    ],
    NODE,
    ["--experimental-strip-types", "--import", PRELOAD, "entry.ts"],
    nodeModulesRoot,
    env
  );

  // A missing report must fail the test loudly, never read as a silent pass.
  const report: Report = JSON.parse(
    readFileSync(join(result.root, "probe-report.json"), "utf8")
  );

  return { ...result, report };
}

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8");
}

describe("the detectors", () => {
  it("reports a driver import, which opens no socket", () => {
    const run = runProbe(fixture("imports-driver.ts"), CORE_MODULES);

    expect(run.failed).toBe(false);

    expect(run.report.resolved).toContain("pg");

    expect(run.report.connections).toEqual([]);
  });

  it("reports a real connection attempt", () => {
    const run = runProbe(fixture("opens-connection.ts"), CORE_MODULES);

    expect(run.failed).toBe(false);

    expect(run.report.connections).toContain("socket");

    expect(run.report.connections).toContain("dns");
  });
});

/**
 * Every subpath export that ships. `.` is the runtime root, which reaches the driver on
 * purpose, and `./testing` is the test harness, which starts a container and runs migrations.
 * Neither is part of the build-safe surface.
 */
const RUNTIME_SUBPATHS = new Set([".", "./testing"]);

/**
 * A browser feature entrypoint: a `./features/*` subpath. It ships `.ts` but reaches `.tsx`, which
 * Node's type stripper cannot load (ERR_UNKNOWN_FILE_EXTENSION), so the runtime probe below cannot
 * evaluate it. It gets the static import-graph probe instead, which is TSX-capable: it fails on a
 * database driver, the node-postgres adapter, a connection builtin, the core runtime, or a
 * `process.env` read. No subpath is exempt from a safety assertion.
 */
function isBrowserFeature(subpath: string): boolean {
  return subpath.startsWith("./features/");
}

function buildSafeSubpaths(): {
  readonly subpath: string;
  readonly entry: string;
}[] {
  const manifest: Manifest = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/package.json"), "utf8")
  );

  return Object.entries(manifest.exports)
    .filter(([subpath]) => !RUNTIME_SUBPATHS.has(subpath))
    .map(([subpath, entry]) => ({ subpath, entry }));
}

describe("the build-safe entrypoints", () => {
  const CLEARED = [
    "DATABASE_URL",

    "PUBLIC_URL",

    "KEYCLOAK_URL",

    "BETTER_AUTH_SECRET",
  ];

  // Seed the parent with recognizable values so accidentally inheriting its
  // environment makes the child fail. Restore them for subsequent tests.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(buildSafeSubpaths())(
    "keeps $subpath free of a driver, a connection and a deployment read",
    ({ subpath, entry }) => {
      if (isBrowserFeature(subpath)) {
        // The browser feature graph is checked statically: it reaches `.tsx`, which the Node
        // runtime probe cannot load.
        const report = analyzeFeatureGraph(
          resolve(WORKSPACE_ROOT, "packages/core", entry)
        );

        expect(report.violations).toEqual([]);
        // A walk that resolved nothing would pass vacuously; the real tree is several files.
        expect(report.files.length).toBeGreaterThan(3);

        return;
      }

      for (const name of CLEARED)
        vi.stubEnv(name, "build-safety-test-sentinel");

      const env = { ...process.env };

      for (const name of CLEARED) delete env[name];

      const specifier = `@genie/core${subpath.replace(/^\./, "")}`;

      const run = runProbe(
        `
const requiredAbsent = ${JSON.stringify(CLEARED)};
if (requiredAbsent.some((name) => Object.hasOwn(process.env, name))) {
  throw new Error("Deployment environment reached build-safe import");
}
await import(${JSON.stringify(specifier)});
console.log("deployment-environment:absent");
`,
        APP_MODULES,
        env
      );

      expect(run.failed).toBe(false);

      expect(run.output).toContain("deployment-environment:absent");

      expect(run.report.resolved).toEqual([]);

      expect(run.report.connections).toEqual([]);
    }
  );
});

describe("the browser feature graph probe", () => {
  it("flags a driver import and a process.env read", () => {
    const dir = mkdtempSync(join(tmpdir(), "genie-feature-graph-"));

    try {
      const entry = join(dir, "entry.ts");

      writeFileSync(
        entry,
        `import { Pool } from "pg";\nimport { other } from "./other.ts";\nexport const x = [Pool, other, process.env.DATABASE_URL];\n`
      );
      writeFileSync(join(dir, "other.ts"), `export const other = 1;\n`);

      const report = analyzeFeatureGraph(entry);

      // The walk reached both files, so an empty violation list below would not be vacuous.
      expect(report.files.length).toBe(2);
      expect(report.violations.some((line) => line.includes("pg"))).toBe(true);
      expect(
        report.violations.some((line) => line.includes("process.env"))
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

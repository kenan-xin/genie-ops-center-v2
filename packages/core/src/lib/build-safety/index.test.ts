import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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

function runProbe(entrySource: string, nodeModulesRoot: string) {
  const result = probe(
    [
      { path: "package.json", source: PACKAGE },

      { path: "entry.ts", source: entrySource },
    ],
    NODE,
    ["--experimental-strip-types", "--import", PRELOAD, "entry.ts"],
    nodeModulesRoot
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

/** Every subpath export except the runtime root; these are the build-safe surface. */
function buildSafeSubpaths(): readonly string[] {
  const manifest: Manifest = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/package.json"), "utf8")
  );

  return Object.keys(manifest.exports).filter((subpath) => subpath !== ".");
}

describe("the build-safe entrypoints", () => {
  const CLEARED = [
    "DATABASE_URL",

    "PUBLIC_URL",

    "KEYCLOAK_URL",

    "BETTER_AUTH_SECRET",
  ];

  // The child inherits this worker's environment, so the clearing has to happen
  // here. Stubbing rather than deleting keeps it out of every later test file
  // that shares the worker.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(buildSafeSubpaths())(
    "imports %s with no deployment variable and starts nothing",
    (subpath) => {
      for (const name of CLEARED) vi.stubEnv(name, undefined);

      const specifier = `@genie/core${subpath.replace(/^\./, "")}`;

      const run = runProbe(
        `await import(${JSON.stringify(specifier)});\n`,
        APP_MODULES
      );

      expect(run.failed).toBe(false);

      expect(run.report.resolved).toEqual([]);

      expect(run.report.connections).toEqual([]);
    }
  );
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, probe } from "../../__testing__/target-probe.ts";
import { createTenantContext } from "./index.ts";

const MINIMAL = {
  DATABASE_URL: "postgres://genie:secret@db.invalid:5432/genie",
  PUBLIC_URL: "https://genie.example.com",
};

const NODE = process.execPath;

const PRELOAD = join(
  WORKSPACE_ROOT,
  "packages/core/src/lib/build-safety/detect-initialization.ts"
);

const CORE_MODULES = join(WORKSPACE_ROOT, "packages/core/node_modules");

type Report = { readonly connections: readonly string[] };

/** Runs one entry file under the initialization detectors and reads its report. */
function runProbe(source: string) {
  const result = probe(
    [
      { path: "package.json", source: `{\n  "type": "module"\n}\n` },
      { path: "entry.ts", source },
    ],
    NODE,
    ["--experimental-strip-types", "--import", PRELOAD, "entry.ts"],
    CORE_MODULES
  );

  const report: Report = JSON.parse(
    readFileSync(join(result.root, "probe-report.json"), "utf8")
  );

  return { failed: result.failed, report };
}

describe("createTenantContext", () => {
  it("holds the two fixed members and nothing else (R-18)", async () => {
    const context = createTenantContext(MINIMAL);

    try {
      expect(Object.keys(context).toSorted()).toEqual(["db", "env"]);
      expect(context.env.databaseUrl).toBe(MINIMAL.DATABASE_URL);
      expect(context.env.lockTimeoutMs).toBe(120000);
    } finally {
      await context.db.$client.end();
    }
  });

  it("gives each call its own pool, so two contexts share nothing", async () => {
    const first = createTenantContext(MINIMAL);
    const second = createTenantContext(MINIMAL);

    try {
      expect(first.db).not.toBe(second.db);
      expect(first.db.$client).not.toBe(second.db.$client);
    } finally {
      await Promise.all([first.db.$client.end(), second.db.$client.end()]);
    }
  });

  it("refuses an invalid environment and names the variable", () => {
    expect(() =>
      createTenantContext({ PUBLIC_URL: MINIMAL.PUBLIC_URL })
    ).toThrow("DATABASE_URL");
  });

  it("opens no connection while building the context", () => {
    // The pool is lazy: a connection belongs to the first query, and to the
    // migrator's own reserved client, never to the factory (R-19).
    const run = runProbe(`
import { createTenantContext } from ${JSON.stringify(
      join(WORKSPACE_ROOT, "packages/core/src/lib/tenant-context/index.ts")
    )};

const context = createTenantContext(${JSON.stringify(MINIMAL)});

await context.db.$client.end();
`);

    expect(run.failed).toBe(false);
    expect(run.report.connections).toEqual([]);
  });

  it("opens no connection when the environment is refused", () => {
    const run = runProbe(`
import { createTenantContext } from ${JSON.stringify(
      join(WORKSPACE_ROOT, "packages/core/src/lib/tenant-context/index.ts")
    )};

try {
  createTenantContext({ PUBLIC_URL: "https://genie.example.com" });
} catch {
  console.log("refused");
}
`);

    expect(run.failed).toBe(false);
    expect(run.report.connections).toEqual([]);
  });
});

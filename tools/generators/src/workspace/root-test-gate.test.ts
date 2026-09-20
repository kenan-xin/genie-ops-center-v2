import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../..");

const TARGET_FLAGS = new Set(["-t", "--target", "--targets"]);

type RootScripts = { readonly scripts: Readonly<Record<string, string>> };

/**
 * Runs the root `test` script in a disposable directory against a stub `nx` that
 * records each invocation, so the guard reads what Nx was asked to run instead
 * of matching the script text. The real suite never runs: the stub shadows the
 * workspace binary and the fixture holds no project.
 */
function recordRootTestGate(): readonly string[] {
  const fixture = mkdtempSync(join(tmpdir(), "genie-root-gate-"));
  const bin = join(fixture, "bin");
  const record = join(fixture, "nx-argv.log");

  mkdirSync(bin);

  const stub = join(bin, "nx");

  writeFileSync(
    stub,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$NX_RECORD"\n`,
    "utf8"
  );
  chmodSync(stub, 0o755);
  writeFileSync(record, "", "utf8");

  // SAFETY: the root manifest is a JSON object, and the guard throws right below
  // when it carries no string `test` script, so the narrowed shape is checked.
  const manifest = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf8")
  ) as RootScripts;

  const script = manifest.scripts.test;

  if (script === undefined) {
    throw new Error("the root package.json carries no test script to guard");
  }

  execFileSync("sh", ["-c", script], {
    cwd: fixture,
    env: {
      ...process.env,
      NX_RECORD: record,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
  });

  return readFileSync(record, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

/** The target names the recorded `nx` invocations ask `run-many` for. */
function runManyTargets(recorded: readonly string[]): readonly string[] {
  const targets: string[] = [];

  for (const invocation of recorded) {
    const argv = invocation.split(/\s+/u);

    for (let index = 1; index < argv.length; index += 1) {
      const token = argv[index] ?? "";
      const separator = token.indexOf("=");
      const inline = separator === -1 ? null : token.slice(separator + 1);
      const flag = separator === -1 ? token : token.slice(0, separator);

      if (!TARGET_FLAGS.has(flag)) {
        continue;
      }

      const values =
        inline === null ? argv.slice(index + 1) : inline.split(",");

      for (const value of values) {
        if (value.length > 0 && !value.startsWith("-")) {
          targets.push(value);
        }
      }
    }
  }

  return targets;
}

describe("the root test gate", () => {
  it("asks Nx for the workspace validate target, not the unit collection alone", () => {
    const targets = runManyTargets(recordRootTestGate());

    expect(targets).toContain("test");
    expect(targets).toContain("validate");
  });
});

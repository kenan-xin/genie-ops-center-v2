import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

type ConfigManifest = { readonly scripts: { readonly lint: string } };

/**
 * Runs the config package's lint script in a disposable tree against a stub
 * `oxlint` that records the argv it was handed, so the guard reads what oxlint
 * actually received rather than guessing from the script text. The script
 * `cd ../..`s, so the fixture mirrors `<root>/packages/config`.
 */
function recordedLintArgv(): readonly string[] {
  const fixture = mkdtempSync(join(tmpdir(), "genie-lint-scope-"));
  const bin = join(fixture, "bin");
  const record = join(fixture, "argv.txt");
  const projectDir = join(fixture, "packages/config");

  mkdirSync(bin, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  const stub = join(bin, "oxlint");

  writeFileSync(
    stub,
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "$OXLINT_RECORD"\n`,
    "utf8"
  );
  chmodSync(stub, 0o755);
  writeFileSync(record, "", "utf8");

  // SAFETY: this is the repository's own tracked manifest; the guard fails
  // loudly when the lint script is absent or not a string.
  const manifest = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/config/package.json"), "utf8")
  ) as ConfigManifest;

  try {
    execFileSync("sh", ["-c", manifest.scripts.lint], {
      cwd: projectDir,
      env: {
        ...process.env,
        OXLINT_RECORD: record,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      },
    });

    return readFileSync(record, "utf8")
      .split("\n")
      .filter((line) => line.length > 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

/**
 * The paths an argv hands oxlint, consuming each option's value. `--config=x`
 * carries its value, so it is one token; `--config x` spends the next token,
 * which is why a config path in that form is not a linted path.
 */
function positionalPaths(argv: readonly string[]): readonly string[] {
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    if (token.startsWith("-")) {
      if (!token.includes("=")) index += 1;
      continue;
    }

    positionals.push(token);
  }

  return positionals;
}

describe("the config package lint scope", () => {
  // `tsconfig.base.json` is not here: it is JSONC, which oxlint does not lint.
  // The compiler reads it through `extends`, so `nx typecheck` is its check.
  it("hands the root TypeScript config files to oxlint as paths, not option values", () => {
    const positionals = positionalPaths(recordedLintArgv());

    expect(positionals).toContain("oxlint.config.ts");
    expect(positionals).toContain("oxfmt.config.ts");
  });

  it("lints the authored boundary plugin, which is outside the config package's src", () => {
    const positionals = positionalPaths(recordedLintArgv());

    expect(positionals).toContain("packages/config/oxlint/boundaries");
  });
});

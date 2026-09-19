import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readModulesFile } from "./modules-file.ts";

function fileHolding(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "genie-modules-")), "modules.txt");

  writeFileSync(path, contents, "utf8");

  return path;
}

describe("readModulesFile", () => {
  it("reads one id per line and keeps the file order", () => {
    expect(readModulesFile(fileHolding("beta\nalpha\n"))).toBe("beta,alpha");
  });

  it("ignores a blank line and trailing spacing", () => {
    expect(readModulesFile(fileHolding("  beta  \n\n alpha\n\n"))).toBe("beta,alpha");
  });

  it("returns an explicitly empty value for a file that lists no module", () => {
    expect(readModulesFile(fileHolding("\n  \n"))).toBe("");
  });

  it("fails on a missing file rather than falling back to every module", () => {
    expect(() => readModulesFile("/tmp/genie-absent/modules.txt")).toThrow(/does not exist/i);
  });
});

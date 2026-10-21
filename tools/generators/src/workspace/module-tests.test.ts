import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { moduleTestFiles, moduleTestsError } from "./module-tests.ts";

const temporary: string[] = [];

function disposableWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "genie-module-tests-"));

  temporary.push(root);

  return root;
}

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("the module-has-tests rule", () => {
  it("fails a module package that ships no test file", () => {
    const root = disposableWorkspace();

    mkdirSync(join(root, "packages/modules/empty/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/modules/empty/src/index.ts"),
      "export const value = 1;\n",
      "utf8"
    );

    expect(moduleTestsError("packages/modules/empty", root)).toMatch(
      /ships no test file/
    );
  });

  it("passes a module with a unit test", () => {
    const root = disposableWorkspace();

    mkdirSync(join(root, "packages/modules/unit/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/modules/unit/src/index.test.ts"),
      "export {};\n",
      "utf8"
    );

    expect(moduleTestsError("packages/modules/unit", root)).toBeUndefined();
  });

  it("passes a module whose only evidence is a browser or integration test", () => {
    const root = disposableWorkspace();

    mkdirSync(join(root, "packages/modules/e2e/e2e"), { recursive: true });
    writeFileSync(
      join(root, "packages/modules/e2e/e2e/main.spec.ts"),
      "export {};\n",
      "utf8"
    );

    expect(moduleTestFiles("packages/modules/e2e", root)).toEqual([
      "packages/modules/e2e/e2e/main.spec.ts",
    ]);
  });

  it("ignores a test file inside node_modules, which is not the module's own", () => {
    const root = disposableWorkspace();

    mkdirSync(join(root, "packages/modules/vendored/node_modules/dep"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "packages/modules/vendored/node_modules/dep/index.test.ts"),
      "export {};\n",
      "utf8"
    );

    expect(moduleTestsError("packages/modules/vendored", root)).toMatch(
      /ships no test file/
    );
  });
});

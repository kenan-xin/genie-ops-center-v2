import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { projectReadmeError } from "./project-readme.ts";

const temporary: string[] = [];

function disposableProject(readme: string | undefined): string {
  const root = mkdtempSync(join(tmpdir(), "genie-project-readme-"));

  temporary.push(root);

  mkdirSync(join(root, "packages/modules/alpha"), { recursive: true });

  if (readme !== undefined) {
    writeFileSync(
      join(root, "packages/modules/alpha/README.md"),
      readme,
      "utf8"
    );
  }

  return root;
}

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

// The injected-failure proof behind the hygiene suite's README case: validate
// must fail a project without a README, not only pass the real workspace.
describe("the project README rule", () => {
  it("fails a project that holds no README.md", () => {
    const root = disposableProject(undefined);

    expect(projectReadmeError("packages/modules/alpha", root)).toMatch(
      /holds no README\.md/
    );
  });

  it("fails a README that does not say what the project imports", () => {
    const root = disposableProject("# alpha\n\nA module.\n");

    expect(projectReadmeError("packages/modules/alpha", root)).toMatch(
      /does not say what it imports/
    );
  });

  it("accepts a README that says what the project imports", () => {
    const root = disposableProject("# alpha\n\n## What it imports\n\nCore.\n");

    expect(projectReadmeError("packages/modules/alpha", root)).toBeUndefined();
  });
});

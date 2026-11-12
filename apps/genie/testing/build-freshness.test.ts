import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertBuildIsCurrent } from "./build-freshness.ts";
import { buildSourceHash } from "./build-source-hash.ts";

const REBUILD = "MODULE_INCLUDE=placeholder pnpm exec nx run @genie/app:build";

let dir: string;

let root: string;

let artifact: string;

let hashFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "build-freshness-"));

  root = mkdtempSync(join(dir, "src-"));

  artifact = join(dir, "artifact.js");

  hashFile = join(dir, "genie-source-hash");

  writeFileSync(join(root, "index.ts"), "export const a = 1;\n");
  writeFileSync(artifact, "built\n");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("assertBuildIsCurrent", () => {
  it("passes a build whose stored hash matches the tree, however old its files are", () => {
    writeFileSync(hashFile, `${buildSourceHash([root])}\n`);
    utimesSync(artifact, 0, 0);

    expect(() =>
      assertBuildIsCurrent(artifact, { hashFile, roots: [root] })
    ).not.toThrow();
  });

  it("refuses a build made from other source, naming the rebuild", () => {
    writeFileSync(hashFile, `${buildSourceHash([root])}\n`);
    writeFileSync(join(root, "index.ts"), "export const a = 2;\n");

    expect(() =>
      assertBuildIsCurrent(artifact, { hashFile, roots: [root] })
    ).toThrow(
      new RegExp(
        `comes from other source than the tree holds now[\\s\\S]*${REBUILD}`
      )
    );
  });

  it("refuses a build that holds no source hash, naming the rebuild", () => {
    expect(() =>
      assertBuildIsCurrent(artifact, { hashFile, roots: [root] })
    ).toThrow(new RegExp(`holds no source hash[\\s\\S]*${REBUILD}`));
  });
});

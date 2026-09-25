import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const sourceRoots = [
  join(repositoryRoot, "packages/core/src"),
  join(repositoryRoot, "packages/modules"),
  join(repositoryRoot, "apps/genie/src"),
];

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);

    if (entry.isDirectory()) return sourceFiles(path);

    if (!sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      return [];
    }

    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return [];

    return [path];
  });
}

function isStorageAdapter(path: string): boolean {
  return relative(repositoryRoot, path)
    .split(sep)
    .some((segment) => /^adapters?$/i.test(segment));
}

describe("file_blob access boundary", () => {
  it("keeps runtime references to file_blob inside storage adapters", () => {
    const files = sourceRoots.flatMap(sourceFiles);

    const violations = files.flatMap((path) => {
      // The core schema declares the table; storage operations belong in an adapter.
      if (path === join(repositoryRoot, "packages/core/src/schema.ts"))
        return [];

      if (isStorageAdapter(path)) return [];

      return /\bfile_blob\b/i.test(readFileSync(path, "utf8"))
        ? [relative(repositoryRoot, path)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});

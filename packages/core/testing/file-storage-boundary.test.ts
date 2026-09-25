import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
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

type SourceFile = { readonly path: string; readonly source: string };

function isStorageAdapter(path: string): boolean {
  const adapterRoot = join(
    repositoryRoot,
    "packages/core/src/services/file-storage/adapters"
  );

  const relativePath = relative(adapterRoot, path);
  const adapterPath = relative(repositoryRoot, path);

  return (
    adapterPath.startsWith(
      "packages/core/src/services/file-storage/adapters/"
    ) &&
    relativePath !== ".." &&
    !relativePath.startsWith("../")
  );
}

function fileBlobViolations(files: readonly SourceFile[]): string[] {
  return files.flatMap(({ path, source }) => {
    // The schema declares the table, and only the core file-storage adapter may operate on it.
    if (path === join(repositoryRoot, "packages/core/src/schema.ts")) return [];

    if (isStorageAdapter(path)) return [];

    return /\b(?:file_blob|fileBlob)\b/.test(source)
      ? [relative(repositoryRoot, path)]
      : [];
  });
}

describe("file_blob access boundary", () => {
  it("keeps runtime references to file_blob inside storage adapters", () => {
    const files = sourceRoots
      .flatMap(sourceFiles)
      .map((path) => ({ path, source: readFileSync(path, "utf8") }));

    const violations = fileBlobViolations(files);

    expect(violations).toEqual([]);
  });

  it("catches a planted fileBlob import under a module adapter directory", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "file-blob-boundary-"));

    const moduleSources = join(
      temporaryRoot,
      "packages/modules/example/src/adapters"
    );

    const plantedPath = join(moduleSources, "file-leak.ts");

    try {
      mkdirSync(moduleSources, { recursive: true });
      writeFileSync(
        plantedPath,
        'import { fileBlob } from "@genie/core/schema";\n'
      );

      const plantedFiles = sourceFiles(join(temporaryRoot, "packages/modules"));

      const violations = fileBlobViolations(
        plantedFiles.map((path) => ({
          path,
          source: readFileSync(path, "utf8"),
        }))
      );

      expect(violations).toEqual([relative(repositoryRoot, plantedPath)]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

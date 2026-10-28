import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot, sourceFiles, sourceRoots } from "./source-files.ts";

const KEY_TABLE = /\b(?:tenant_integration_key|tenantIntegrationKey)\b/;

/** The schema declares the table, and only the one integrations service may operate on it. */
const ALLOWED = new Set([
  join(repositoryRoot, "packages/core/src/schema.ts"),
  join(repositoryRoot, "packages/core/src/services/integrations/keys.ts"),
]);

type SourceFile = { readonly path: string; readonly source: string };

function keyTableViolations(files: readonly SourceFile[]): string[] {
  return files.flatMap(({ path, source }) =>
    !ALLOWED.has(path) && KEY_TABLE.test(source)
      ? [relative(repositoryRoot, path)]
      : []
  );
}

describe("tenant_integration_key access boundary", () => {
  it("keeps runtime references to tenant_integration_key inside the integrations service", () => {
    const files = sourceRoots
      .flatMap(sourceFiles)
      .map((path) => ({ path, source: readFileSync(path, "utf8") }));

    expect(keyTableViolations(files)).toEqual([]);
  });

  it("catches a planted reference in a module source file", () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "integration-key-boundary-")
    );

    const moduleSources = join(temporaryRoot, "packages/modules/example/src");

    const plantedPath = join(moduleSources, "key-leak.ts");

    try {
      mkdirSync(moduleSources, { recursive: true });
      writeFileSync(
        plantedPath,
        'import { tenantIntegrationKey } from "@genie/core/schema";\n'
      );

      const plantedFiles = sourceFiles(join(temporaryRoot, "packages/modules"));

      expect(
        keyTableViolations(
          plantedFiles.map((path) => ({
            path,
            source: readFileSync(path, "utf8"),
          }))
        )
      ).toEqual([relative(repositoryRoot, plantedPath)]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

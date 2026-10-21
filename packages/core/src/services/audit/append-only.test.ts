import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The never-prune guard of `docs/architecture/permission-evolution.md`: `audit_event` is
 * append-only, and its `core:permission_transformation` rows are the transformation ledger, so a
 * deletion would make the next start apply a revocation again. A retention job or an erase path
 * that must touch audit rows changes this guard and that document together, and keeps those rows.
 */
const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

const WRITE_TO_AUDIT =
  /delete\s+from\s+"?audit_event|truncate\s+(table\s+)?"?audit_event|update\s+"?audit_event|\.(delete|update)\(\s*auditEvent\b/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sourceFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test(-d)?\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("the audit_event append-only guard", () => {
  it("recognizes each kind of write it forbids", () => {
    for (const sample of [
      "delete from audit_event where true",
      'TRUNCATE TABLE "audit_event"',
      "update audit_event set summary = ''",
      "tx.delete(auditEvent)",
    ]) {
      expect(WRITE_TO_AUDIT.test(sample), sample).toBe(true);
    }
  });

  it("finds no source that deletes, truncates or updates audit rows", () => {
    const roots = ["packages/core/src", "packages/modules", "apps/genie/src"];

    const offenders = roots
      .flatMap((root) => sourceFiles(join(WORKSPACE_ROOT, root)))
      .flatMap((path) =>
        WRITE_TO_AUDIT.test(readFileSync(path, "utf8"))
          ? [relative(WORKSPACE_ROOT, path)]
          : []
      );

    expect(offenders).toEqual([]);
  });
});

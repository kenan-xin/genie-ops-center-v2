import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CORE_ADMIN_NAVIGATION, coreAdminPermission } from "@genie/core";
import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "app");

/**
 * ARCH-2: the core admin table and the admin pages cannot disagree on who may open a page. Each
 * entry has a page at its path, and that page asks the table for its own entry's permission.
 */
describe("core admin pages", () => {
  const entries = CORE_ADMIN_NAVIGATION.flatMap((group) => group.entries);

  it.each(entries.map((entry) => [entry.id, entry.path]))(
    "%s has a page at %s that opens behind its own table entry",
    (id, path) => {
      const page = join(APP, path, "page.tsx");

      expect(existsSync(page)).toBe(true);

      const source = readFileSync(page, "utf8");

      expect(source).toMatch(
        new RegExp(`renderIfPermitted\\(\\s*coreAdminPermission\\("${id}"\\)`)
      );
      expect(source).not.toMatch(/: PermissionKey =/);
    }
  );

  it("refuses an id the table does not declare at compile time", () => {
    // @ts-expect-error an unknown id is not a CoreAdminEntryId
    expect(() => coreAdminPermission("core-unknown")).toThrow();
  });
});

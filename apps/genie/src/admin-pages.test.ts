import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { CORE_ADMIN_NAVIGATION, coreAdminPermission } from "@genie/core";
import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "app");

/**
 * ARCH-2: the core admin table and the admin pages cannot disagree on who may open a page. Each
 * entry has a page at its path, and that page asks the table for its own entry's permission.
 * NAV-1: a loading fallback starts the response before its page, so a loading file sits only where
 * every status decision runs before it: a core admin page, whose `PageLoading` checks the session,
 * and a module route, whose own layout decides the 404 and the sign-in redirect (`6wz1.76`). The
 * door and the account pages redirect from the page itself, so they get none.
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

  it.each(entries.map((entry) => [entry.id, entry.path]))(
    "%s shows the page skeleton while %s loads (NAV-1)",
    (_id, path) => {
      expect(readFileSync(join(APP, path, "loading.tsx"), "utf8")).toContain(
        "<PageLoading />"
      );
    }
  );

  it("holds no other loading.tsx than the admin pages and the four module routes, so the door and the account pages answer before any fallback (NAV-1)", () => {
    const found = readdirSync(APP, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith("loading.tsx"))
      .map((file) => file.split(sep).join("/"))
      .toSorted();

    expect(found).toEqual(
      [
        ...entries.map((entry) => `${entry.path.slice(1)}/loading.tsx`),
        "(workspace)/placeholder/[[...path]]/loading.tsx",
        "(workspace)/m/[moduleId]/[[...path]]/loading.tsx",
        "admin/placeholder/[[...path]]/loading.tsx",
        "admin/m/[moduleId]/[[...path]]/loading.tsx",
      ].toSorted()
    );
  });

  it("refuses an id the table does not declare at compile time", () => {
    // @ts-expect-error an unknown id is not a CoreAdminEntryId
    expect(() => coreAdminPermission("core-unknown")).toThrow();
  });
});

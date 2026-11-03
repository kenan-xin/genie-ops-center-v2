import { type NavigationEntry, validateModule } from "@genie/core";
import { describe, expect, it } from "vitest";

import { analyticsModule } from "./module.ts";

describe("the analytics module declaration", () => {
  it("satisfies every rule the contract validator checks", () => {
    expect(validateModule(analyticsModule)).toEqual([]);
  });

  it("declares its own three permission keys and no other module's", () => {
    expect(analyticsModule.permissions.map((entry) => entry.key)).toEqual([
      "analytics:use",
      "analytics:read",
      "analytics:write",
    ]);
  });

  it("requires its use key on every workspace entry (DEC-50)", () => {
    const workspace = analyticsModule.navigation.entries.filter(
      (entry) => entry.surface === "workspace"
    );

    expect(workspace.length).toBeGreaterThan(0);

    for (const entry of workspace) {
      expect(entry.requiredPermission).toBe("analytics:use");
    }
  });

  it("claims no landing route, so an include list stays valid (DEC-49)", () => {
    // Read through the contract's own type: the declaration is narrower than it,
    // and a literal that never carries the flag has no property to read.
    const entries: readonly NavigationEntry[] =
      analyticsModule.navigation.entries;

    for (const entry of entries) {
      expect(entry.landing).toBeUndefined();
    }
  });

  it("adds Analytics editor on Access, the owner's default access role (A6)", () => {
    // A dashboard is visible to its owner only, so editing grants no reach into another person's work (owner, 2026-11-02).
    expect(analyticsModule.defaultAccessRole).toBe("Analytics editor");
  });

  it("contributes no frame origin until it frames something", async () => {
    expect(await analyticsModule.contentSecurityPolicy.frameOrigins()).toEqual(
      []
    );
  });

  it("hands core a migration declaration it has not read yet", () => {
    expect(analyticsModule.schema.migrations).toBeInstanceOf(Function);
    expect(analyticsModule.schema.migrationsTable).toBe(
      "__drizzle_migrations_analytics"
    );
  });

  it("reads its own SQL when core calls the declaration", () => {
    // Calling it proves the static URLs resolve to real files, which is what the
    // deferred read defers. Nothing reads them at import time.
    const history = analyticsModule.schema.migrations();

    expect(history).toHaveLength(1);
    expect(history[0]?.sql.join("")).toContain('CREATE TABLE "dashboard"');
  });
});

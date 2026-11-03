import { type NavigationEntry, validateModule } from "@genie/core";
import { describe, expect, it } from "vitest";

import { slidesModule } from "./module.ts";

describe("the slides module declaration", () => {
  it("satisfies every rule the contract validator checks", () => {
    expect(validateModule(slidesModule)).toEqual([]);
  });

  it("declares its own three permission keys and no other module's", () => {
    expect(slidesModule.permissions.map((entry) => entry.key)).toEqual([
      "slides:use",
      "slides:read",
      "slides:write",
    ]);
  });

  it("requires its use key on every workspace entry (DEC-50)", () => {
    const workspace = slidesModule.navigation.entries.filter(
      (entry) => entry.surface === "workspace"
    );

    expect(workspace.length).toBeGreaterThan(0);

    for (const entry of workspace) {
      expect(entry.requiredPermission).toBe("slides:use");
    }
  });

  it("claims no landing route, so an include list stays valid (DEC-49)", () => {
    // Read through the contract's own type: the declaration is narrower than it,
    // and a literal that never carries the flag has no property to read.
    const entries: readonly NavigationEntry[] = slidesModule.navigation.entries;

    for (const entry of entries) {
      expect(entry.landing).toBeUndefined();
    }
  });

  it("adds Slides editor on Access, the owner's default access role (A6)", () => {
    // A deck is visible to its owner only, so editing grants no reach into another person's work (owner, 2026-11-02).
    expect(slidesModule.defaultAccessRole).toBe("Slides editor");
  });

  it("contributes no frame origin until it frames something", async () => {
    expect(await slidesModule.contentSecurityPolicy.frameOrigins()).toEqual([]);
  });

  it("hands core a migration declaration it has not read yet", () => {
    expect(slidesModule.schema.migrations).toBeInstanceOf(Function);
    expect(slidesModule.schema.migrationsTable).toBe(
      "__drizzle_migrations_slides"
    );
  });

  it("reads its own SQL when core calls the declaration", () => {
    // Calling it proves the static URLs resolve to real files, which is what the
    // deferred read defers. Nothing reads them at import time.
    const history = slidesModule.schema.migrations();

    expect(history).toHaveLength(1);
    expect(history[0]?.sql.join("")).toContain('CREATE TABLE "deck"');
  });
});

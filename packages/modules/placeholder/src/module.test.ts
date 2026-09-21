import { type NavigationEntry, validateModule } from "@genie/core";
import { describe, expect, it } from "vitest";

import { placeholderModule } from "./module.ts";

describe("the placeholder module declaration", () => {
  it("satisfies every rule the contract validator checks", () => {
    expect(validateModule(placeholderModule)).toEqual([]);
  });

  it("declares the identity R-15 fixes", () => {
    expect(placeholderModule.identity.id).toBe("placeholder");
    expect(placeholderModule.identity.displayName).toBe("Placeholder");
    expect(placeholderModule.identity.version.length).toBeGreaterThan(0);
  });

  it("declares the three permission keys and the DEC-50 default role", () => {
    expect(placeholderModule.permissions.map((entry) => entry.key)).toEqual([
      "placeholder:read",
      "placeholder:use",
      "placeholder:admin",
    ]);

    expect(placeholderModule.defaultRoles).toEqual([
      { name: "Placeholder user", permissions: ["placeholder:use"] },
    ]);
  });

  it("gives the DEC-51 guard one workspace entry of each category case", () => {
    const entries: readonly NavigationEntry[] =
      placeholderModule.navigation.entries;

    const workspace = entries.filter((entry) => entry.surface === "workspace");

    expect(workspace).toHaveLength(3);

    const withCategory = workspace.filter(
      (entry) => entry.categoryId !== undefined
    );

    expect(withCategory).toHaveLength(2);
    expect(workspace.length - withCategory.length).toBe(1);
  });

  it("pins entries it declares, in order", () => {
    const declared = new Set(
      placeholderModule.navigation.entries.map((entry) => entry.id)
    );

    expect(
      placeholderModule.navigation.pinned.map((entry) => entry.id)
    ).toEqual(["placeholder-home", "placeholder-archive"]);

    for (const entry of placeholderModule.navigation.pinned) {
      expect(declared.has(entry.id)).toBe(true);
    }
  });

  it("carries no landing flag, because Section 0 ships no landing module", () => {
    for (const entry of placeholderModule.navigation.entries) {
      expect(entry).not.toHaveProperty("landing");
    }
  });

  it("declares one field of each of the five configuration kinds", () => {
    expect(Object.keys(placeholderModule.configuration.fields)).toEqual([
      "title",
      "pageSize",
      "enabled",
      "mode",
      "tags",
    ]);
  });

  it("names its own migration history and table", () => {
    expect(placeholderModule.schema.migrationsTable).toBe(
      "__drizzle_migrations_placeholder"
    );

    expect(placeholderModule.schema.migrationsFolder).toBe(
      "packages/modules/placeholder/drizzle"
    );
  });

  it("contributes one https frame origin", async () => {
    await expect(
      placeholderModule.contentSecurityPolicy.frameOrigins()
    ).resolves.toEqual(["https://embed.placeholder.example.com"]);
  });

  it("resolves a record to a label and a path", async () => {
    const [recordType] = placeholderModule.recordTypes;

    await expect(recordType?.resolve("r1")).resolves.toEqual({
      label: "Placeholder record r1",
      path: "/placeholder/r1",
    });
  });
});

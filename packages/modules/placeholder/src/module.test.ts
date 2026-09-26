import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { type NavigationEntry, validateModule } from "@genie/core";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";

import { placeholderModule } from "./module.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- this declaration assertion is one contract. */

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

  it("declares the placeholder record reader job", () => {
    expect(
      placeholderModule.jobs.map(({ name, schedule }) => ({ name, schedule }))
    ).toEqual([{ name: "placeholder.read-record", schedule: undefined }]);
  });
  /* oxlint-enable anti-slop/require-readable-spacing */

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
  });

  it("carries its migration history as data, not as a folder path", () => {
    // A folder path would be resolved at run time, which is what keeps the SQL out of a
    // production image: the bundler follows no folder and copies no folder.
    expect(placeholderModule.schema).not.toHaveProperty("migrationsFolder");

    expect(placeholderModule.schema.migrations()).toHaveLength(2);
  });

  it("declares the same migrations drizzle's own folder reader produces", () => {
    // The guard against two kinds of drift: a migration generated into the folder without its
    // `new URL` beside it, and a reader of ours that stopped agreeing with drizzle's. The
    // hashes are what the ledger stores, so they must match statement for statement.
    // The directory URL below is the spelling the rest of this package may no longer use. It is
    // allowed here, and only here, because driving drizzle's own folder reader is the whole
    // point of the comparison, and because a test file is never bundled into the image.
    const fromFolder = readMigrationFiles({
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
      migrationsTable: placeholderModule.schema.migrationsTable,
    });

    expect(placeholderModule.schema.migrations()).toEqual(fromFolder);
  });

  it("carries the real SQL of the one migration on disk", () => {
    const onDisk = readFileSync(
      new URL("../drizzle/0000_boring_gargoyle.sql", import.meta.url),
      "utf8"
    );

    expect(placeholderModule.schema.migrations()[0]?.sql.join("")).toBe(onDisk);
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

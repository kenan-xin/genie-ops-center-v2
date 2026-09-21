import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, describe, expect, it } from "vitest";

import { type MigrationJournal, migrationsFromJournal } from "./history.ts";

/**
 * The reader that replaced the folder read. Its one obligation is that it agrees with
 * `readMigrationFiles` from `drizzle-orm/migrator` statement for statement and hash for hash:
 * the hash is what the ledger stores, so a reader that drifted would write a different history
 * into a database that drizzle itself had migrated.
 *
 * The fixtures are written to a temporary folder because core's own journal holds no entry yet,
 * and because the comparison needs a folder for drizzle's reader to read.
 */
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

type Fixture = {
  readonly folder: string;
  readonly journal: MigrationJournal;
  readonly files: Readonly<Record<string, URL>>;
};

/** One drizzle-kit folder on disk, and the same history declared the way a module declares it. */
async function writeFixture(
  statements: Readonly<Record<string, string>>
): Promise<Fixture> {
  const folder = await mkdtemp(join(tmpdir(), "genie-history-"));

  cleanups.push(() => rm(folder, { recursive: true, force: true }));

  await mkdir(join(folder, "meta"), { recursive: true });

  const tags = Object.keys(statements);

  const entries = tags.map((tag, idx) => ({
    idx,
    version: "7",
    when: 1789948987482 + idx,
    tag,
    breakpoints: true,
  }));

  await Promise.all(
    tags.map((tag) =>
      writeFile(join(folder, `${tag}.sql`), statements[tag] ?? "", "utf8")
    )
  );

  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries }),
    "utf8"
  );

  const files = Object.fromEntries(
    tags.map((tag) => [tag, pathToFileURL(join(folder, `${tag}.sql`))])
  );

  return { folder, journal: { entries }, files };
}

describe("migrations read from declared files", () => {
  it("matches drizzle's own folder reader for a single migration", async () => {
    const fixture = await writeFixture({
      "0000_first": 'CREATE TABLE "alpha_record" ("id" integer PRIMARY KEY);',
    });

    expect(migrationsFromJournal(fixture.journal, fixture.files)).toEqual(
      readMigrationFiles({ migrationsFolder: fixture.folder })
    );
  });

  it("matches drizzle's own folder reader across a statement breakpoint", async () => {
    const fixture = await writeFixture({
      "0000_first": [
        'CREATE TABLE "alpha_record" ("id" integer PRIMARY KEY);',
        "--> statement-breakpoint",
        'CREATE TABLE "beta_record" ("id" integer PRIMARY KEY);',
      ].join("\n"),
    });

    const mine = migrationsFromJournal(fixture.journal, fixture.files);

    expect(mine).toEqual(
      readMigrationFiles({ migrationsFolder: fixture.folder })
    );

    expect(mine[0]?.sql).toHaveLength(2);
  });

  it("matches drizzle's own folder reader, and its order, across several migrations", async () => {
    const fixture = await writeFixture({
      "0000_first": 'CREATE TABLE "alpha_record" ("id" integer PRIMARY KEY);',
      "0001_second": 'CREATE TABLE "beta_record" ("id" integer PRIMARY KEY);',
      "0002_third": 'CREATE TABLE "gamma_record" ("id" integer PRIMARY KEY);',
    });

    const mine = migrationsFromJournal(fixture.journal, fixture.files);

    expect(mine).toEqual(
      readMigrationFiles({ migrationsFolder: fixture.folder })
    );

    expect(mine.map((migration) => migration.folderMillis)).toEqual([
      1789948987482, 1789948987483, 1789948987484,
    ]);
  });

  it("applies nothing when the journal is empty, which is core's state today", () => {
    expect(migrationsFromJournal({ entries: [] }, {})).toEqual([]);
  });

  it("refuses a journal entry whose file was never declared", async () => {
    const fixture = await writeFixture({
      "0000_first": 'CREATE TABLE "alpha_record" ("id" integer PRIMARY KEY);',
    });

    // The drift this guards: a migration generated into the folder without the `new URL`
    // beside it. Without the refusal the build would trace no file and the image would
    // silently skip that migration.
    expect(() => migrationsFromJournal(fixture.journal, {})).toThrow(
      /0000_first/
    );
  });
});

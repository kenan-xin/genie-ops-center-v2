import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { MigrationMeta } from "drizzle-orm/migrator";

/** One entry of a drizzle-kit journal: the SQL file's tag, when it was generated, its breakpoints. */
export type MigrationJournalEntry = {
  readonly tag: string;
  readonly when: number;
  readonly breakpoints: boolean;
};

/**
 * A drizzle-kit `meta/_journal.json`. A declaration imports its own journal as a module, so the
 * build carries the order and the timestamps rather than reading them from a folder at run time.
 */
export type MigrationJournal = {
  readonly entries: readonly MigrationJournalEntry[];
};

/**
 * Where each journal entry's SQL file is, keyed by that entry's tag.
 *
 * Every value is a `new URL("<tag>.sql", import.meta.url)` written at the declaration site, and
 * that spelling is the whole point: a production bundler follows it, emits the file beside the
 * server it builds and rewrites the URL to the emitted copy. A folder path is followed by
 * nothing and copied by nothing, so the SQL never reaches the image.
 */
export type MigrationFiles = Readonly<Record<string, URL>>;

/** Drizzle splits one file into statements on this marker; the ledger hash covers the whole file. */
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

/**
 * The migrations one history applies, in journal order, read from files the build traced.
 *
 * This is `readMigrationFiles` from `drizzle-orm/migrator` with the folder taken out: the same
 * order, the same split and the same hash, so a database migrated through either records the
 * same ledger rows. `history.test.ts` pins that equivalence against drizzle's own reader.
 *
 * A journal entry whose file is not declared fails here, at the first run access (core's lazy
 * getter, or a module's `migrations()` thunk), rather than half way through migrating a
 * container.
 */
export function migrationsFromJournal(
  journal: MigrationJournal,
  files: MigrationFiles
): readonly MigrationMeta[] {
  return journal.entries.map((entry) => {
    const file = files[entry.tag];

    if (file === undefined) {
      throw new Error(
        `the migration journal names ${entry.tag}, which no declared file provides`
      );
    }

    const query = readFileSync(file, "utf8");

    return {
      sql: query.split(STATEMENT_BREAKPOINT),
      bps: entry.breakpoints,
      folderMillis: entry.when,
      hash: createHash("sha256").update(query).digest("hex"),
    };
  });
}

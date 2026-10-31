import { migrationsFromJournal } from "@genie/core";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import journal from "../drizzle/meta/_journal.json" with { type: "json" };
import type { DeckContent, UndoEntry } from "./content.ts";

/**
 * One person's deck (R-52). The owner is a `user.id` by value with no foreign key (data-shape
 * module rule 2), and every read filters on it. `content` is parsed by `deckContentSchema`
 * before it is written, and `content_hash` is computed by Postgres in the same statement (D2).
 * `frozen_on` is the reporting date of the frozen figures (D3), `undo` the last saves, newest
 * first (D1), `image_file_ids` the files the deck's images may name (D6), and `export_file_id`
 * the last PowerPoint export (D7). The table belongs to this module: core never reads it (DEC-33).
 */
export const deck = pgTable(
  "deck",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerUserId: text("owner_user_id").notNull(),
    title: text("title").notNull(),
    content: jsonb("content").$type<DeckContent>().notNull(),
    contentHash: text("content_hash").notNull(),
    frozenOn: date("frozen_on").notNull(),
    undo: jsonb("undo").$type<readonly UndoEntry[]>().notNull().default([]),
    imageFileIds: uuid("image_file_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    exportFileId: uuid("export_file_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("deck_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
    check(
      "deck_title_check",
      sql`btrim(${table.title}) <> '' and char_length(${table.title}) <= 80`
    ),
    check(
      "deck_content_hash_check",
      sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "deck_slides_check",
      sql`jsonb_typeof(${table.content} -> 'slides') = 'array' and jsonb_array_length(${table.content} -> 'slides') <= 20`
    ),
    check(
      "deck_undo_check",
      sql`jsonb_typeof(${table.undo}) = 'array' and jsonb_array_length(${table.undo}) <= 10`
    ),
  ]
);

/** The module's own migration history table (R-24). */
export const MIGRATIONS_TABLE = "__drizzle_migrations_slides";

/**
 * Every SQL file the journal above names, one `new URL` each. This spelling is what puts the
 * SQL in the image: a production bundler follows a file reference written this way, emits the
 * file beside the server and rewrites the URL to the emitted copy, while a folder path is
 * followed by nothing and copied by nothing. A new migration adds its line here in the same
 * change that generates it, and `migrationsFromJournal` refuses to start if it does not.
 */
const MIGRATION_FILES = {
  "0000_initial": new URL("../drizzle/0000_initial.sql", import.meta.url),
};

/**
 * This module's migration history, in journal order (R-24).
 *
 * A thunk, not an array: the SQL read is deferred to the first call, because a page's SSR
 * compilation resolves the same SQL URL to a public asset path `readFileSync` cannot open, and
 * a module-scope read would fail that compilation. The `new URL` declarations above stay at
 * module scope on purpose: that spelling is what the bundler traces to copy the SQL into the
 * image, so this thunk defers only the read, never the URL declarations. Called once per
 * history at bootstrap.
 */
export const MIGRATIONS = () => migrationsFromJournal(journal, MIGRATION_FILES);

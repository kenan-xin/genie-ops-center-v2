import { migrationsFromJournal } from "@genie/core";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import journal from "../drizzle/meta/_journal.json" with { type: "json" };
import type { DashboardConfig, UndoEntry } from "./config.ts";

/**
 * One person's dashboard (R-48). The owner is a `user.id` by value with no foreign key
 * (data-shape module rule 2), and every read filters on it. `config` is parsed by
 * `dashboardConfigSchema` before it is written; `undo` holds the last saves, newest first (D1).
 * The table belongs to this module: core never reads it (DEC-33).
 */
export const dashboard = pgTable(
  "dashboard",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    config: jsonb("config").$type<DashboardConfig>().notNull(),
    undo: jsonb("undo").$type<readonly UndoEntry[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One name per owner, whatever its case and outer spaces; another owner may use it.
    uniqueIndex("dashboard_owner_name_key").on(
      table.ownerUserId,
      sql`lower(btrim(${table.name}))`
    ),
    index("dashboard_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
    check(
      "dashboard_name_check",
      sql`btrim(${table.name}) <> '' and char_length(${table.name}) <= 80`
    ),
    check("dashboard_version_check", sql`${table.version} >= 1`),
    check(
      "dashboard_undo_check",
      sql`jsonb_typeof(${table.undo}) = 'array' and jsonb_array_length(${table.undo}) <= 20`
    ),
  ]
);

/** The module's own migration history table (R-24). */
export const MIGRATIONS_TABLE = "__drizzle_migrations_analytics";

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

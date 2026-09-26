import { migrationsFromJournal } from "@genie/core";
import { sql } from "drizzle-orm";
import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import journal from "../drizzle/meta/_journal.json" with { type: "json" };

/**
 * The module's one record table. A primary key is a UUID and an edited table carries both
 * timestamps (data-shape rules 4 and 5). The table belongs to this module: core never reads it, and
 * it exists only in an image that includes this module (DEC-33).
 */
export const placeholderRecord = pgTable("placeholder_record", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The idempotent effect of one event subscription: one row per handler and event, so a delivery
 * that runs twice leaves the same result (R-55). Owned by this module for the same reason as the
 * record table (DEC-33).
 */
export const placeholderEventEffect = pgTable(
  "placeholder_event_effect",
  {
    handler: text("handler").notNull(),
    eventId: uuid("event_id").notNull(),
    label: text("label").notNull(),
  },
  (table) => [primaryKey({ columns: [table.handler, table.eventId] })]
);

/** The module's own migration history table (R-24). */
export const MIGRATIONS_TABLE = "__drizzle_migrations_placeholder";

/**
 * Every SQL file the journal above names, one `new URL` each. This spelling is what puts the
 * SQL in the image: a production bundler follows a file reference written this way, emits the
 * file beside the server and rewrites the URL to the emitted copy, while a folder path is
 * followed by nothing and copied by nothing. A new migration adds its line here in the same
 * change that generates it, and `migrationsFromJournal` refuses to start if it does not.
 */
const MIGRATION_FILES = {
  "0000_boring_gargoyle": new URL(
    "../drizzle/0000_boring_gargoyle.sql",
    import.meta.url
  ),
  "0001_placeholder-event-effect": new URL(
    "../drizzle/0001_placeholder-event-effect.sql",
    import.meta.url
  ),
};

/**
 * This module's migration history, in journal order (R-24).
 *
 * A thunk, not an array: the SQL read is deferred to the first call, because a page's SSR
 * compilation resolves the same SQL URL to a public asset path `readFileSync` cannot open, and a
 * module-scope read would fail that compilation. The `new URL` declarations above stay at module
 * scope on purpose: that spelling is what the bundler traces to copy the SQL into the image, so
 * this thunk defers only the read, never the URL declarations. Called once per history at
 * bootstrap.
 */
export const MIGRATIONS = () => migrationsFromJournal(journal, MIGRATION_FILES);

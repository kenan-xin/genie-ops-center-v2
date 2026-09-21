import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The module's one table. A primary key is a UUID and an edited table carries both timestamps
 * (data-shape rules 4 and 5). The table belongs to this module: core never reads it, and it
 * exists only in an image that includes this module (DEC-33).
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

/** The module's own migration history table (R-24). */
export const MIGRATIONS_TABLE = "__drizzle_migrations_placeholder";

/** The folder holding this module's migration history, relative to the repository root. */
export const MIGRATIONS_FOLDER = "packages/modules/placeholder/drizzle";

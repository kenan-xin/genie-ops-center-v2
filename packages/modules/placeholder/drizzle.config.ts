import { defineConfig } from "drizzle-kit";

/**
 * The migration history of this module. drizzle-kit writes the SQL file and the journal; neither
 * is edited by hand. The history and its table belong to the module alone (R-24).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  migrations: { table: "__drizzle_migrations_placeholder" },
});

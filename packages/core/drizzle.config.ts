import { defineConfig } from "drizzle-kit";

/**
 * Core's own migration history. Section 0 creates no core table, so the folder holds the
 * journal and nothing else until the first core table arrives. The history and its table are
 * core's alone, and a module never writes to them (R-24).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  migrations: { table: "__drizzle_migrations" },
});

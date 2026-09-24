import { defineConfig } from "drizzle-kit";

/**
 * Core's own migration history. The Section 1 migration creates the deployment tables (R-1).
 * The history and its table are core's alone, and a module never writes to them (R-24).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  migrations: { table: "__drizzle_migrations" },
});

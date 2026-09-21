import type { PgTable } from "drizzle-orm/pg-core";

/**
 * Core's own tables. Section 0 creates none: the deployment tables arrive with Section 1. The
 * map exists so core's migration history has a schema to read, and so the first core table has
 * one known place to land (data-shape, the core tables).
 */
export const coreTables: Readonly<Record<string, PgTable>> = {};

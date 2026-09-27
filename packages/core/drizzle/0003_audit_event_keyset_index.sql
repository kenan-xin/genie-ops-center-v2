-- The reader orders newest first on (occurred_at, id) descending (R-67), so one composite index in
-- that order replaces the single-column occurrence-time index and lets a page be an index scan.
-- `audit_event` was created in 0000, and the migrator applies the whole history in one transaction
-- under its advisory lock, where Postgres refuses `CREATE INDEX CONCURRENTLY`. The plain creation is
-- therefore the only form that runs; the table is append-only and this history is applied before the
-- application serves requests.
-- squawk-ignore require-concurrent-index-creation, require-concurrent-index-deletion
DROP INDEX "audit_event_occurred_at_idx";--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "audit_event_occurred_at_id_idx" ON "audit_event" USING btree ("occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);

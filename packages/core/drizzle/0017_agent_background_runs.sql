-- Long background agent runs (DEC-57): up to 3 runs per person, which `startRun` counts under an
-- advisory lock, and one run per record, which an index holds. agent_session is small, and the
-- migrator applies the history in one transaction before the app serves.
ALTER TABLE "agent_session" ADD COLUMN "run_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "run_unseen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Two people's active runs on one record: the newest keeps building, the others end interrupted.
UPDATE "agent_session" SET "run_state" = NULL, "run_error" = 'interrupted', "run_unseen" = true
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "surface", "record_id" ORDER BY "updated_at" DESC, "id" DESC) AS "rank"
    FROM "agent_session"
    WHERE "run_state" IS NOT NULL AND "record_id" IS NOT NULL
  ) AS "ranked"
  WHERE "rank" > 1
);--> statement-breakpoint
-- squawk-ignore require-concurrent-index-deletion
DROP INDEX "agent_session_one_run_per_user_idx";--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX "agent_session_one_run_per_record_idx" ON "agent_session" USING btree ("surface","record_id") WHERE "agent_session"."run_state" is not null and "agent_session"."record_id" is not null;--> statement-breakpoint
-- A run that builds now gets a full time box of the default.
UPDATE "agent_session" SET "run_deadline_at" = now() + interval '120 minutes' WHERE "run_state" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "agent_run_time_box_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_agent_run_time_box_check" CHECK ("tenant_settings"."agent_run_time_box_minutes" between 10 and 1440);

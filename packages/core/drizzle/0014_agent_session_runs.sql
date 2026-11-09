-- agent_session is small, and the migrator applies the history in one transaction before the app serves.
ALTER TABLE "agent_session" ADD COLUMN "surface" text DEFAULT 'core:ask' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "record_id" text;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "handed_from_session_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "run_state" text;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "run_job_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "run_error" text;--> statement-breakpoint
-- squawk-ignore adding-foreign-key-constraint,constraint-missing-not-valid
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_handed_from_session_id_agent_session_id_fk" FOREIGN KEY ("handed_from_session_id") REFERENCES "public"."agent_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX "agent_session_one_run_per_user_idx" ON "agent_session" USING btree ("user_id") WHERE "agent_session"."run_state" is not null;--> statement-breakpoint
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_run_state_check" CHECK ("agent_session"."run_state" in ('queued', 'running', 'stopping'));--> statement-breakpoint
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_run_error_check" CHECK ("agent_session"."run_error" in ('stopped', 'interrupted', 'failed'));--> statement-breakpoint
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_run_job_check" CHECK ("agent_session"."run_state" is null or "agent_session"."run_job_id" is not null);
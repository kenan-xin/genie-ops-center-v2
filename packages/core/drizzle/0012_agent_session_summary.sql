ALTER TABLE "agent_session" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "summary_through_seq" bigint;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "last_input_tokens" integer;
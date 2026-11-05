CREATE TABLE "agent_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"title" text NOT NULL,
	"format" text NOT NULL,
	"dataset" text NOT NULL,
	"query" jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"file_id" uuid,
	"row_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_file_session_tool_call_unique" UNIQUE("session_id","tool_call_id"),
	CONSTRAINT "agent_file_format_check" CHECK ("agent_file"."format" in ('csv', 'xlsx', 'md', 'pdf')),
	CONSTRAINT "agent_file_state_check" CHECK ("agent_file"."state" in ('queued', 'running', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_file" ADD CONSTRAINT "agent_file_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_file" ADD CONSTRAINT "agent_file_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_file_session_created_idx" ON "agent_file" USING btree ("session_id","created_at");
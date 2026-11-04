CREATE TABLE "agent_artifact" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"latest_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_artifact_session_number_unique" UNIQUE("session_id","number"),
	CONSTRAINT "agent_artifact_kind_check" CHECK ("agent_artifact"."kind" in ('chart', 'table', 'document', 'record-list'))
);
--> statement-breakpoint
CREATE TABLE "agent_artifact_version" (
	"artifact_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_artifact_version_artifact_id_version_pk" PRIMARY KEY("artifact_id","version")
);
--> statement-breakpoint
ALTER TABLE "agent_artifact" ADD CONSTRAINT "agent_artifact_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_artifact_version" ADD CONSTRAINT "agent_artifact_version_artifact_id_agent_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."agent_artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_artifact_version" ADD CONSTRAINT "agent_artifact_version_message_id_agent_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_artifact_session_created_idx" ON "agent_artifact" USING btree ("session_id","created_at");
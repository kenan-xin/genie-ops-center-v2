CREATE TABLE "dashboard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"undo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_name_check" CHECK (btrim("dashboard"."name") <> '' and char_length("dashboard"."name") <= 80),
	CONSTRAINT "dashboard_version_check" CHECK ("dashboard"."version" >= 1),
	CONSTRAINT "dashboard_undo_check" CHECK (jsonb_typeof("dashboard"."undo") = 'array' and jsonb_array_length("dashboard"."undo") <= 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_owner_name_key" ON "dashboard" USING btree ("owner_user_id",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "dashboard_owner_updated_idx" ON "dashboard" USING btree ("owner_user_id","updated_at");
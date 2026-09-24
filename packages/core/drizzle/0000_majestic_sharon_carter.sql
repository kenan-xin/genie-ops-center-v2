CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" text NOT NULL,
	"scan_status" text DEFAULT 'skipped' NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_blob" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_window" (
	"endpoint" text NOT NULL,
	"subject" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_window_endpoint_subject_window_start_pk" PRIMARY KEY("endpoint","subject","window_start")
);
--> statement-breakpoint
CREATE TABLE "retirement" (
	"retired_at" timestamp with time zone NOT NULL,
	"deletion_hold" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_step" (
	"step" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_branding" (
	"company_name" text NOT NULL,
	"product_name" text NOT NULL,
	"logo_light_file_id" uuid,
	"logo_dark_file_id" uuid,
	"logo_mark_file_id" uuid,
	"favicon_file_id" uuid,
	"primary_color" text,
	"primary_foreground" text,
	"default_theme" text DEFAULT 'system' NOT NULL,
	"font_family" text DEFAULT 'plus-jakarta-sans' NOT NULL,
	"font_size" text DEFAULT 'default' NOT NULL,
	"text_color" text,
	"login_background_file_id" uuid,
	"login_background_color" text,
	"login_welcome_text" text,
	"login_notice_text" text,
	"login_notice_requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"email_sender_name" text,
	"email_reply_to" text,
	"email_footer_text" text,
	"support_url" text,
	"support_email" text,
	"terms_url" text,
	"privacy_url" text,
	"default_locale" text NOT NULL,
	"default_time_zone" text NOT NULL,
	"date_format" text,
	"number_format" text,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_module" (
	"module_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"category_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"onboarding_mode" text DEFAULT 'invite' NOT NULL,
	"local_accounts_enabled" boolean DEFAULT false NOT NULL,
	"realm_supports_local_accounts" boolean DEFAULT false NOT NULL,
	"session_idle_minutes" integer DEFAULT 15 NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_event_target_idx" ON "audit_event" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_event_occurred_at_idx" ON "audit_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "file_storage_key_idx" ON "file" USING btree ("storage_key");
--> statement-breakpoint
ALTER TABLE "file_blob" ALTER COLUMN "bytes" SET STORAGE EXTERNAL;

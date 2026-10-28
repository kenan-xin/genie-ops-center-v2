ALTER TABLE "tenant_settings" ADD COLUMN "allowed_models" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "chat_model" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "document_model" text;
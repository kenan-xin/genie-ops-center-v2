ALTER TABLE "document" ALTER COLUMN "kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "reading_status" text DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "reading_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "reading_outcome" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "reading" jsonb;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_reading_status_check" CHECK ("document"."reading_status" in ('reading', 'could-not-read', 'read'));--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_reading_attempts_check" CHECK ("document"."reading_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_reading_outcome_check" CHECK ("document"."reading_outcome" in ('confirm-split', 'no-match', 'possible-duplicate', 'ai-off', 'no-text-layer'));
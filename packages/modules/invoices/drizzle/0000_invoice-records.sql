CREATE TABLE "allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_invoice_payment_key" UNIQUE("invoice_id","payment_id"),
	CONSTRAINT "allocation_amount_cents_check" CHECK ("allocation"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "allocation_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"action" text NOT NULL,
	"amount_before_cents" integer NOT NULL,
	"amount_after_cents" integer NOT NULL,
	"automatic" boolean NOT NULL,
	"actor_user_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_event_action_check" CHECK ("allocation_event"."action" in ('linked', 'changed', 'unlinked')),
	CONSTRAINT "allocation_event_amount_before_cents_check" CHECK ("allocation_event"."amount_before_cents" >= 0),
	CONSTRAINT "allocation_event_amount_after_cents_check" CHECK ("allocation_event"."amount_after_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_origin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"field" text NOT NULL,
	"origin" text NOT NULL,
	"quote" text,
	"page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_origin_document_field_key" UNIQUE("document_id","field"),
	CONSTRAINT "field_origin_origin_check" CHECK ("field_origin"."origin" in ('extracted', 'entered', 'corrected')),
	CONSTRAINT "field_origin_page_check" CHECK ("field_origin"."page" > 0),
	CONSTRAINT "field_origin_extracted_check" CHECK ("field_origin"."origin" <> 'extracted' or ("field_origin"."quote" is not null and "field_origin"."page" is not null))
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"document_id" uuid,
	"number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"due_date_source" text NOT NULL,
	"payment_terms" text,
	"currency" text NOT NULL,
	"total_cents" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_document_id_key" UNIQUE("document_id"),
	CONSTRAINT "invoice_due_date_source_check" CHECK ("invoice"."due_date_source" in ('document', 'person', 'unspecified')),
	CONSTRAINT "invoice_due_date_check" CHECK (("invoice"."due_date" is null) = ("invoice"."due_date_source" = 'unspecified')),
	CONSTRAINT "invoice_currency_check" CHECK ("invoice"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoice_total_cents_check" CHECK ("invoice"."total_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"document_id" uuid,
	"payment_date" date NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference" text,
	"method" text,
	"named_invoice_numbers" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_document_id_key" UNIQUE("document_id"),
	CONSTRAINT "payment_currency_check" CHECK ("payment"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payment_amount_cents_check" CHECK ("payment"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sha256_key" UNIQUE("sha256"),
	CONSTRAINT "document_sha256_check" CHECK ("document"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_kind_check" CHECK ("document"."kind" in ('invoice', 'payment', 'paid-receipt', 'purchase-order'))
);
--> statement-breakpoint
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_event" ADD CONSTRAINT "allocation_event_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_event" ADD CONSTRAINT "allocation_event_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_origin" ADD CONSTRAINT "field_origin_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocation_payment_id_idx" ON "allocation" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "allocation_event_invoice_occurred_idx" ON "allocation_event" USING btree ("invoice_id","occurred_at");--> statement-breakpoint
CREATE INDEX "allocation_event_payment_occurred_idx" ON "allocation_event" USING btree ("payment_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_name_key" ON "customer" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "invoice_customer_number_idx" ON "invoice" USING btree ("customer_id",upper(btrim("number")));--> statement-breakpoint
CREATE INDEX "payment_customer_date_idx" ON "payment" USING btree ("customer_id","payment_date");
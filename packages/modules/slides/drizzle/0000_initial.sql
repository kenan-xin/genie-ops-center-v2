CREATE TABLE "deck" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"frozen_on" date NOT NULL,
	"undo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_file_ids" uuid[] DEFAULT '{}' NOT NULL,
	"export_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_title_check" CHECK (btrim("deck"."title") <> '' and char_length("deck"."title") <= 80),
	CONSTRAINT "deck_content_hash_check" CHECK ("deck"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "deck_slides_check" CHECK (jsonb_typeof("deck"."content" -> 'slides') = 'array' and jsonb_array_length("deck"."content" -> 'slides') <= 20),
	CONSTRAINT "deck_undo_check" CHECK (jsonb_typeof("deck"."undo") = 'array' and jsonb_array_length("deck"."undo") <= 10)
);
--> statement-breakpoint
CREATE INDEX "deck_owner_updated_idx" ON "deck" USING btree ("owner_user_id","updated_at");
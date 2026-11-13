CREATE TABLE "file_link_key" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"secret" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_link_key_one_row" CHECK ("file_link_key"."id" = 1)
);

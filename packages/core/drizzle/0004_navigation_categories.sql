CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" text,
	"time_zone" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- R-86a: a category id that names no category row becomes null before the key exists, so a
-- database whose category_id was edited by hand still upgrades. `category` was created above;
-- the NOT EXISTS form states the rule instead of relying on that.
UPDATE "tenant_module" SET "category_id" = NULL WHERE "category_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "category" WHERE "category"."id" = "tenant_module"."category_id");--> statement-breakpoint
-- The category key validates by scanning `tenant_module` under a SHARE ROW EXCLUSIVE lock. The
-- table holds one row per compiled module, and every category_id is null after the update above,
-- so the scan finds no violation. The history runs in one transaction under the advisory lock
-- before the app serves requests, so `NOT VALID` would give no lock benefit here.
-- squawk-ignore adding-foreign-key-constraint,constraint-missing-not-valid
ALTER TABLE "tenant_module" ADD CONSTRAINT "tenant_module_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;
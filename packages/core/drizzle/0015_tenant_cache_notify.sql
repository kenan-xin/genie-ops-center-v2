-- Every app copy clears its cached tenant readers when one of the four tables they read changes
-- (DEC-58, amends DEC-46). A statement trigger covers every writer, the services, the genie-ops
-- commands, the seed and the migrator's registration, and Postgres delivers the notification only
-- when the transaction commits, so a rolled-back save sends none. The payload names the table.
CREATE FUNCTION "genie_notify_tenant_cache"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('genie_tenant_cache', TG_TABLE_NAME);
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tenant_settings_notify_tenant_cache" AFTER INSERT OR UPDATE OR DELETE ON "tenant_settings" FOR EACH STATEMENT EXECUTE FUNCTION "genie_notify_tenant_cache"();--> statement-breakpoint
CREATE TRIGGER "tenant_branding_notify_tenant_cache" AFTER INSERT OR UPDATE OR DELETE ON "tenant_branding" FOR EACH STATEMENT EXECUTE FUNCTION "genie_notify_tenant_cache"();--> statement-breakpoint
CREATE TRIGGER "tenant_module_notify_tenant_cache" AFTER INSERT OR UPDATE OR DELETE ON "tenant_module" FOR EACH STATEMENT EXECUTE FUNCTION "genie_notify_tenant_cache"();--> statement-breakpoint
CREATE TRIGGER "category_notify_tenant_cache" AFTER INSERT OR UPDATE OR DELETE ON "category" FOR EACH STATEMENT EXECUTE FUNCTION "genie_notify_tenant_cache"();

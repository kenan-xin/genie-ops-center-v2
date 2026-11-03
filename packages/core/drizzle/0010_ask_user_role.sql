-- A deployment whose `roles` setup step finished before this release never runs that step again,
-- so it receives the core system role `Ask user` here (Spec 2 R-33, A7). A fresh database gets the
-- role from the `roles` step (`seedRoles`), so this inserts nothing before that step is done. The
-- insert matches by name, never rewrites an existing role and assigns the role to nobody (R-33a).
-- It stores no description: a read shows the core line for a core system role that stores none.
INSERT INTO "role" ("name", "permissions", "is_system")
SELECT 'Ask user', ARRAY['core:ask:use']::text[], true
WHERE EXISTS (SELECT 1 FROM "setup_step" WHERE "step" = 'roles' AND "state" = 'done')
ON CONFLICT ("name") DO NOTHING;

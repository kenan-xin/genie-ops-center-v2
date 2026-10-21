-- A scope is both columns or neither (data-shape.md, "Roles and permissions"). The migrator
-- applies the whole history in one transaction under the advisory lock before the app serves
-- requests, as 0001 notes for its foreign keys, so `NOT VALID` and a later `VALIDATE` would give no
-- lock benefit here, and `role_assignment` holds no row a writer could have written yet.
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_scope_pair" CHECK (("role_assignment"."scope_type" is null) = ("role_assignment"."scope_id" is null));

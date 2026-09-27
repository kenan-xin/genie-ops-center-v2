# Permission and system-role evolution

Status: policy accepted 2026-09-18. Implemented 2026-09-27 (S2-06): the evaluator, the transformation mechanism below, and the upgrade matrix in `packages/core/testing/permission-evolution.integration.test.ts`. The role-editor browser proof belongs to S2-11. Applies to core and every module. Sections 1 and 2 own upgrade integration and authorization; later modules use the same policy.

## Upgrade policy

For the administrator/member walkthroughs and scenario-to-spec mapping, see [Module activation and permission upgrades](../flows/module-access-upgrades.md), CF-MA-01–09. This document owns the technical policy and upgrade verification matrix; the flow document explains the business outcomes.

Permission identifiers are stable public identifiers for an action. Prefer changing the display label over renaming a key. A key must never be reused for a different capability or silently broadened to cover a new privileged action. In particular, an existing `:use` permission must not become an implicit approval or deletion permission merely because a new UI action is introduced.

| Change | Allowed automatic behavior | Required control |
| --- | --- | --- |
| New permission | Register its definition for the role editor | Do not insert it into existing ordinary system roles or custom roles automatically |
| New privileged capability | Introduce a separate permission and an appropriate new system role | An authorized administrator explicitly assigns the role or edits a custom role; installing the release assigns nobody |
| System-role display name/description | Update metadata | Preserve role ID, permissions, and assignment identities/scopes; a display rename must not seed a duplicate role |
| Equivalent internal change | Apply an explicit, reviewed migration | Prove the effective authority and scopes are unchanged |
| Permission identifier genuinely changes | Apply an explicit semantics-preserving migration to affected system and custom roles | Preserve role IDs and assignments/scopes; demonstrate equivalence and audit the change. Prefer a label-only change where possible |
| Privilege expansion of an existing ordinary system role | None | Use a separate permission/role and administrator opt-in rather than silently expanding existing holders' authority |
| Removal of unsafe authority | Explicit security migration | Audit the revocation, document impact in release notes, preserve unrelated access |
| Retired or unknown key | No effective grant | Show it as unavailable in affected roles; allow removal from custom roles, retain unrelated permissions and assignments, and never reuse the key for another capability |

System roles are product-managed and read-only to administrators; this does not permit silent privilege changes. Seeding missing roles is not permission to overwrite an existing role's permission array. Permission-affecting transformations must be explicit, versioned, reviewed release migrations, repeat-safe and audit-visible. Preserve existing role IDs, group memberships, principals, and scope values except for the specifically documented permission transformation. Audit evidence identifies the migration/release, affected roles, before/after permission changes, and execution provenance; it must not fabricate a human administrator as actor for an automated upgrade. The transformations are versioned and applied by the migrator run (DEC-50, Registration reconciliation owner, 2026-09-23); the mechanism below resolved their storage and transaction ownership on 2026-09-27.

Custom roles, including copies of system roles, are administrator-owned independent bundles. They do not subscribe to future changes of the role they were copied from. Only explicit equivalent-key migrations and documented security revocations above may change their permissions as part of an upgrade; ordinary new privileges require an administrator's edit.

Retired or unknown keys must be ineffective in both `can()` and `scopesFor()` for ordinary role-based evaluation, including broad and inherited assignments. The existing restricted-session and break-glass rules remain separate; no new bypass is introduced. An unavailable key must not prevent the other valid permissions in a mixed role from working. Do not delete whole roles, assignments, groups, or memberships because one key is retired. Do not silently strip unrelated unavailable entries when editing another field. Exact validation behavior for editing/assigning a role that already contains unavailable entries must be specified before implementing those write paths; unavailability itself never creates authority.

## The transformation mechanism (R-33c, resolved 2026-09-27)

A permission transformation is versioned data, not SQL. Core declares its own list beside its migration history, and a module declares its list as the `permissionTransformations` point of the module contract. Each entry has a permanent id, the release that ships it, a description, and one change: rename a key, revoke a key, or rename the display name of one of the owner's own system roles. A module transforms only its own keys, and `validateModule` enforces that.

Core's migrator run applies the transformations after every migration history. It uses the same reserved session and the same advisory lock, and it applies every pending transformation in one transaction. A rename rewrites the key in every role that holds it, system and custom alike, and keeps role ids, assignments, scopes and memberships. A revocation removes the key and keeps the other keys. Each applied transformation writes one `audit_event` row in the same transaction, with action `core:permission_transformation`, no human actor, the release, the change, and the before and after arrays of each role it touched.

That audit row is also the ledger entry. A later run finds it and skips the transformation, so a retry or a second process applies nothing twice, and the advisory lock keeps two processes apart. If a transformation fails, the whole transaction rolls back, the migrator run fails, and the process does not become ready. The next run after the repair applies the same list and reaches the same state as a clean run.

Seeding is separate. `seedRoles` inserts a missing system role by name and never rewrites an existing permission array. A display rename therefore ships as a `rename-role` transformation first, and the seeding then finds the role under its new name.

## Scope and the administrator exception

A whole-module grant covers current and future records within that module, not new actions or unrelated modules. For example, an existing whole-tenant `solutions:use` assignment covers a newly added solution subject to status and entitlement gates; it does not confer a new approval permission or access to a newly installed capability module.

DEC-23's Tenant administrator behavior remains an explicit exception: enabling a module adds its declared module-admin key to this role and disabling removes it. This is not a wildcard grant, not an automatic module-user assignment, and not permission to broaden arbitrary roles. Member-facing use still requires its own grant. Newly installed modules on existing deployments remain disabled pending configuration and explicit enablement (DEC-50).

## Required upgrade verification

Use real migrations and Testcontainers Postgres for existing deployments, not only fresh seeds. Seed system roles, independent custom copies, mixed-module custom roles, direct and group assignments, archived groups, and record-scoped and whole-tenant assignments. Test through the real evaluator and procedure boundaries; database assertions additionally verify preserved identities and transaction state.

| Scenario | Required assertions |
| --- | --- |
| Add a permission and a new system role | Catalogue and role exist; old permission arrays and assignments remain unchanged; existing principals cannot perform the new action until explicitly granted |
| Rename a role's display metadata | Same role ID and assignment IDs/scopes, no duplicate default role, unchanged effective access |
| Equivalent permission rename | Both system and custom roles transform as declared; direct/group, narrow/broad and parent scopes remain equivalent; unrelated keys and memberships remain unchanged |
| Attempt a default-role privilege expansion through declaration reseeding | Existing assigned role is not silently broadened; an explicit migration/approved policy is required, with new authority following administrator opt-in |
| Retire a permission or encounter an unknown key | `can()` refuses and `scopesFor()` yields no granted scopes for that key; valid keys in the same role continue working; role/group/assignment rows remain |
| Security revocation | Targeted authority is removed as specified, other authority survives, and the migration's audit evidence and release-note impact are present |
| Retry or concurrent execution of one migration | No duplicate roles, assignments, or completed-change audit events; no lost permission updates |
| Inject failure during permission migration | No partial permission transformation becomes usable; failed new process does not become ready; repaired retry produces the same final state as a clean run |
| Tenant administrator exception | Only the enabled module's declared admin append changes; unrelated keys remain; member use is not implicitly added |
| Add future records | An existing broad grant covers a new record in its module, a narrow grant does not expand, and neither gains new actions or unrelated module access |

Use E2E at phone and desktop sizes to demonstrate the new permission's denial before an explicit grant and success afterward, plus role-editor visibility of unavailable keys and removal from a custom role without losing its valid access. Use Storybook for warning, read-only system-role, and copied-role states; those stories supplement, never replace, real authorization and migration tests.

Removal/reintroduction and retention follow the accepted [module removal policy](module-removal.md). Database rollback, instant cancellation of running work, and a reconciliation implementation are not approved by this document. Example permission keys in discussions do not define deferred business modules' permission catalogues.

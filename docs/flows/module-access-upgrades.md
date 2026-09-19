# Module activation, permission upgrades and removal

Behavior accepted 2026-09-18. Implementation and tests are not completed. This walkthrough captures accepted activation, permission evolution, and removal/reintroduction policy. Implementation mechanisms still listed as open are not approved.

Primary actors: the tenant administrator responsible for access, members whose existing access must remain predictable, and the operator deploying an upgrade. Business aim: accept new software without silently expanding employee authority or losing existing access configuration.

Examples of an approval action or a reviewer role are illustrative. They do not define the deferred business modules' permission catalogues.

## CF-MA-01 — Set up a newly delivered module before it becomes active

As an administrator, I want to configure a newly delivered capability before people or background processes can use it.

Starting point: the tenant has completed initial setup. An operator deploys a release containing an additional module.

1. The new module appears in core module administration as disabled. Existing modules keep their settings and activation states.
2. The administrator opens its core configuration path without activating the module's own screens.
3. The administrator supplies required configuration. Saving it does not enable the module.
4. The administrator explicitly enables it. Missing or invalid required values leave it disabled with an actionable explanation; a module with no required fields still needs explicit enablement.
5. Once enabled, the existing module-admin rule applies to Tenant administrator. Ordinary people/groups gain no newly created assignment; the administrator grants member access separately.

Success: the configured module is active by an explicit decision, while unrelated roles, groups, memberships, categories and settings remain unchanged. Before activation it performs no new module business work. Repeated startup must not activate it. First-time deployment setup is a separate flow with its existing initial policy.

## CF-MA-02 — Add a privileged action without upgrading everyone into a privileged user

As an administrator, I want to choose who receives a newly introduced approval capability.

1. A release makes a new approval permission and corresponding system role available.
2. Existing members keep their current access. Installing the release does not add the approval permission to ordinary existing roles or assign the new role to anyone.
3. The administrator explicitly assigns the new role to an appropriate person/group, or adds the permission to an administrator-owned custom role.
4. Only principals with an effective grant can perform the new action, within its valid scope and other access gates.

Success: availability is automatic; granting authority is deliberate. Expanding an existing broad Use permission to include approval would violate this outcome even if no permission identifier changed.

## CF-MA-03 — Update role wording without changing access

As an administrator, I want clearer role labels without having to rebuild assignments.

1. A release changes a system role's display name or description.
2. The administrator sees the new wording on the same role, not a second role.
3. The same people/groups retain the same actions and scopes.

Success: metadata changes automatically; permissions and assignments do not. A wording change that implies a different authority is not merely a metadata change.

## CF-MA-04 — Rename a permission without losing or widening existing grants

As an administrator, I want equivalent technical renames to leave people's access intact.

1. Prefer changing the visible label while retaining the underlying permission identifier.
2. If an identifier genuinely must change, the release applies an explicit reviewed equivalence migration to affected system and custom roles.
3. Existing direct/group grants and narrow/broad scopes retain the same authority. Administrators can inspect the recorded change.

Success: no manual reassignment, duplicate roles, lost group memberships, or new authority. A failed transformation must not expose partially changed authorization; retry must not apply the change twice. This is an equivalent migration, not consent for arbitrary custom-role edits.

## CF-MA-05 — Retire a permission without destroying the rest of a role

As an administrator, I want to understand obsolete permissions and safely clean them up.

1. A capability is retired, or a role contains a permission the running product does not recognize.
2. That permission grants nothing. The role indicates an unavailable permission, while its other valid permissions remain usable.
3. For a custom role, the administrator can remove the unavailable entry without deleting the role or its assignments.

Success: no entire group, role, membership, or assignment disappears because one key is obsolete. The retired identifier is never repurposed for a different capability. Precise save/assignment validation for a role retaining unavailable entries remains open; the designer must not invent it.

## CF-MA-06 — Keep a copied role under administrator control

As an administrator, I want a copied role to remain my own permission bundle.

1. The administrator copies a system role and customizes it for a team.
2. A later release changes the original system role's documentation or introduces a new privileged role.
3. The custom copy does not inherit new permissions or resynchronize with its source.

Success: ordinary permission changes remain administrator-controlled. Explicit equivalent-key migrations and documented security revocations are the narrow upgrade exceptions, not a subscription to the original role.

## CF-MA-07 — Keep approved future-record access without granting future actions

As an administrator, I want an explicitly broad grant to cover new records without repeated manual assignment.

1. The administrator grants a group access to every record of a module, now and in the future.
2. A new record is added to that module. Members can use it under the existing permission, subject to entitlement, resource status, and other applicable gates.
3. A separate release adds a privileged action or an unrelated module. Neither is covered by the future-record promise.

Success: broad scope grows with records, not actions. A group granted only selected records does not gain the newly added record automatically.

## CF-MA-08 — Re-enable a module without rebuilding retained access

As an administrator, I want a temporary disable to suspend access without losing its configuration.

1. The administrator disables a module. Retained grants are inactive; they are not deleted.
2. An authorized administrator may remove retained assignments while it is off.
3. On explicit re-enable with valid required configuration, remaining grants become effective subject to current membership, scope and resource gates.

Success: removed assignments do not reappear; existing group membership is not reset. Entitlement changes have the existing bounded reader refresh, not a promise of instantaneous cancellation of running requests. Module image removal/reintroduction is a separate flow, CF-MA-10–11.

## CF-MA-09 — Remove unsafe authority through an explicit security update

As a tenant administrator, I need a security correction to remove unsafe access without unrelated disruption.

1. The release identifies the targeted authority change and its impact in release notes.
2. An explicit security migration removes the unsafe authority and records the change.
3. Unrelated permissions, assignments, scopes and memberships remain intact.

Success: the affected operation is no longer authorized through the removed grant. This documented revocation is an exception to preserving existing permission bundles, not permission to grant new authority silently.

## CF-MA-10 — Remove module code without losing retained business records

As a tenant administrator and operator, we want to stop delivering a module without accidentally deleting its data or leaving work running.

1. Prefer temporary disable when the module may be used again soon. Removing code is a separate deliberate operation.
2. While its code is still installed, disable it, identify active/queued work and integration dependencies, and drain or explicitly cancel work. Unresolved prerequisites block removal.
3. Stop schedules and revoke module-specific inbound credentials. Record completion before deploying the image without the module.
4. The module's routes and code disappear; its records, configuration, applied migration history, roles, assignments and audit remain in this tenant's database.
5. Access shows retained grants as “Unavailable — module not installed”. They grant nothing; unrelated permissions in mixed roles still work. Authorized administrators can remove unwanted assignments.

Success: no silent deletion or lost work, no broken audit links, no module execution. A fresh database excluding a never-installed module still creates none of its tables. Until controlled removal and its tests exist, an upgrade dropping an installed module is rejected, even if it was disabled.

## CF-MA-11 — Bring a removed module back without silently restoring access

As an administrator, I want to review retained access before people regain use of a returning capability.

1. The operator reintroduces the same stable module identity with compatible retained data and supported migrations. Unrelated code cannot reuse its identity to inherit data or grants.
2. The module remains disabled, regardless of its previous activation. Retained configuration and assignments appear in core administration.
3. The administrator reviews configuration and grants, removes unwanted assignments, and confirms that enabling restores the remaining valid access. Both UI and CLI require this deliberate review and activation.
4. Access resumes only under current permissions, memberships, scopes and resource gates. Removed assignments stay removed.
5. Revoked credentials require separate reissue. Cancelled work and stopped schedules do not silently resume.

Success: data can be reused without surprise authority. Invalid configuration, incompatible history or failed migration leaves the module unavailable with actionable errors and no destructive fallback. Repeated startup does not enable it.

## CF-MA-12 — Delete module data only as a separate authorized operation

As the tenant's data owner, I want retention and deletion to follow an explicit agreement, not a side effect of uninstalling software.

1. Removal retains data by default; that is not a promise to retain it indefinitely.
2. Before deletion, agree the exact records/files, exports/backups, unresolved dependencies, retained audit, retention obligations and recoverability.
3. A separately authorized operator procedure performs only that agreed deletion when such a procedure has been designed and approved.

Success: disable, image removal and reintroduction never purge data. No module deletion command or timer is approved here; tenant-wide retirement is a different operation.

## Traceability and required proof

| Scenarios | Owning requirements | Acceptance and design implications |
| --- | --- | --- |
| CF-MA-01 | Section 1 R-27/R-68a; Section 3 R-84a | Section 1 New-module activation acceptance: existing-deployment upgrade, validation failure, repeated startup, app/worker refusal before explicit enable. Modules/core configuration must expose pre-enable setup |
| CF-MA-02–06, CF-MA-09 | Section 2 R-33a–R-33c; Section 4 R-6a | Section 2 AC-25 and the permission-evolution matrix: real-database upgrade tests, explicit opt-in, preserved identities/scopes, failed/repeated execution, retirement and security revocation. Roles design needs unavailable-key and independent-copy behavior |
| CF-MA-07 | Section 2 R-28/R-29/R-33b | Section 2 AC-8/AC-25: broad and narrow grants, future records but not future actions/modules. Access guidance must make the scope clear |
| CF-MA-08 | Section 1 R-68/R-68a; Section 2 R-31; Section 4 R-30 | Section 1 activation verification and Section 4 AC-4: retained assignments, removal while off, and restored access with current gates. Access/Modules show inactive rather than deleted access |
| CF-MA-10 | Section 1 R-79/AC-18/AC-19a; Section 2 R-33d/AC-26; Section 4 R-31/AC-5a; Section 5 R-26b/AC-11 | Early rejection gate; populated-database removal proof; retained but ineffective access |
| CF-MA-11 | Section 1 R-79a/AC-19a; Section 2 R-33d/AC-26; Section 3 R-84b/AC-14a; Section 5 R-26c/AC-11 | Disabled return, grant review, UI/CLI parity, explicit activation; no revived credentials/work |
| CF-MA-12 | Section 5 R-26c/AC-11 | No implicit purge; separately approved deletion scope and recoverability |

Removal proof and implementation gates: [module removal policy](../architecture/module-removal.md), owned operationally by [Spec 5](../specs/05-operations.md).

Sources: [Spec 1](../specs/01-deployment-and-setup.md), [Spec 2](../specs/02-identity-and-access.md), [Spec 3](../specs/03-shell-branding-and-design-system.md), [Spec 4](../specs/04-solutions-module.md), [permission-evolution policy and test matrix](../architecture/permission-evolution.md), and DEC-23/DEC-50 in the [decision log](../core/decision-log.md).

Design entry points: [Access](../design/sections/access/spec.md), [People, groups and roles](../design/sections/people-groups-and-roles/spec.md), and [Modules/settings](../design/sections/audit-and-tenant-settings/spec.md). These links identify affected designs, not completed design alignment. Storybook proves presentation; real integration and E2E tests prove authorization and upgrades.

Remaining decisions: reconciliation transaction ownership; durable removal/reintroduction state and review invalidation; concrete in-flight/queued-work, dependency and resumption mechanisms; external revocation evidence; exact write validation when roles retain unavailable keys; separately authorized permanent-deletion procedure. Do not infer answers from these accepted scenarios.

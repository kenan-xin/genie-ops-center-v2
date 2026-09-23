# Module removal and reintroduction

Accepted 2026-09-18. Requirements only; neither implementation nor lifecycle test execution is claimed. Business walkthroughs: [CF-MA-10–12](../flows/module-access-upgrades.md). Complements [permission evolution](permission-evolution.md) and DEC-50.

## Three distinct operations

| Operation | Code and execution | Retained state | Access restoration |
| --- | --- | --- | --- |
| Disable | Code remains; entitlement gates refuse new business work | Data, configuration, roles and assignments remain | Explicit re-enable restores valid retained grants under current authorization gates |
| Controlled removal | Deploy an image without the module only after removal prerequisites complete | Same tenant database retains records, migration history, configuration, roles, assignments and audit | Reintroduction stays disabled; administrator reviews grants before explicit activation |
| Permanent data deletion | Separate authorized operator operation, never an effect of exclusion or disable | Exact retention/deletion scope must be agreed beforehand | No promise of restoration after deletion |

## Safe delivery gate

Until the controlled removal workflow and its lifecycle tests are implemented and pass, an upgrade that omits a previously installed module must be rejected. Fresh customer images may exclude modules never installed in that database. Changing `MODULE_INCLUDE` alone is not removal authorization.

The upgrade/startup compatibility check must run before serving requests, starting job consumption, or applying destructive reconciliation. Compare compiled identities with durable installed-module history and completed removal evidence; an absent import or a disabled row is not proof of completed removal. Reject unauthorized omission with the affected module and recovery instructions, without deleting its state. Keep this guard when removal is eventually supported. Do not re-enable a disabled module as a recovery shortcut or recommend a database downgrade.

## Controlled removal

An authorized operator coordinates removal with the tenant administrator while the module's code is still available:

1. Disable the module and prevent new business work. Respect the existing bounded entitlement-reader refresh; do not claim instantaneous cancellation of running work.
2. Inventory active work, queued jobs, schedules, inbound endpoints and dependent integrations. Drain work or explicitly authorize cancellation, with outcomes recorded. Unresolved work or dependencies block completion with actionable detail; nothing is silently discarded.
3. Stop schedules, revoke module-specific inbound credentials, and disable execution through its integrations. Shared credentials or integrations belonging to other modules must not be revoked indiscriminately. Where revocation requires an external operator, record completion before removal can proceed.
4. Record completed removal prerequisites durably, then deploy the image excluding the module. A failed deployment leaves it disabled and retained, not implicitly enabled. Retrying must not duplicate effects or lose work.

The removed image contains no module code, routes, migration files or client bundle. The existing database retains module records and its applied migration history; core retains configuration, roles, assignments and audit. A fresh database built without that module never creates its tables. Retention of a tenant's former module data does not permit shipping another tenant's module code or schema.

Unavailable permission keys grant nothing. Mixed-module custom roles retain their other effective permissions. Core Access/role presentation identifies historical grants as “Unavailable — module not installed”; authorized administrators can remove retained assignments. Core must not import the absent module or read its tables to render these states. Audit stays readable without links to missing routes. Retained configuration cannot execute jobs or integrations.

## Reintroduction and deliberate access restoration

Only the same stable module identity with supported compatible retained data may be reintroduced. Validate compatibility and apply supported forward migrations; incompatible data blocks activation without deleting history. Do not reuse an identifier for unrelated code or infer identity from a matching display name.

Reintroduction registers the module **disabled**, regardless of its former enabled state. Preserve configuration and role/assignment identities subject to explicit permission-evolution migrations. Show retained access and configuration through core administration before activation. An authorized administrator reviews retained grants, may remove unwanted ones, and explicitly confirms that enabling restores the remaining grants. The shared UI/CLI enable path must enforce this review/confirmation and required configuration, not permit a CLI bypass. The exact review-evidence representation remains an implementation-design decision.

After activation, only valid remaining assignments are effective, subject to current memberships, archived/deleted principals, resource scopes/status, permission evolution and entitlement. Deleted assignments do not reappear. Tenant administrator module-admin handling follows DEC-23; it is not a member-use grant. Revoked inbound credentials are never revived; reissue separately. Cancelled jobs and stopped schedules do not silently resume on reinstall or enable; deliberate work resumption must be defined before the removal workflow ships.

## Separate permanent deletion

Retain by default; this is not an indefinite-retention promise. A separately authorized operator procedure must name the exact module data and files, export/backup requirements, dependent references and work to resolve, retained audit, retention obligations, and recoverability. Do not inherit tenant-wide retirement's 90-day timer or invent a module deletion timer. No deletion command or implementation is authorized by this policy. Without an approved deletion procedure, removal must not purge anything.

## Required lifecycle proof

Use existing-database integration tests and image/deployment tests, not just registry mocks. Cover direct and group grants, selected-resource and whole-module scopes, independent custom roles, mixed-module roles, current/archived memberships and module-owned records/files.

| Scenario | Required result |
| --- | --- |
| Fresh image omits never-installed module | No excluded code, routes or newly created module tables; core works |
| Upgrade omits installed module without completed removal | Startup/upgrade refused before requests/jobs; records, assignments and migration history preserved |
| Disable → attempted removal with unresolved work/dependencies | Removal blocked; no silently lost work, credential revival or reactivation |
| Completed removal → excluded image | Code/routes absent; records/configuration/history retained; unavailable grants ineffective; unrelated role permissions work; audit has no broken route links |
| Reintroduce same compatible identity | Supported migrations only; remains disabled; retained IDs/config/grants visible for review; no credentials or work automatically resumed |
| Review → remove grant → confirm enable | Only valid remaining grants restore; removed grants, obsolete permissions and lost memberships grant nothing; UI and CLI use the same checks |
| Invalid config, incompatible history or identity reuse | Actionable refusal; no partial activation or destructive fallback |
| Failure, concurrent attempts and retries at each transition | Consistent durable state; no duplicate authority, silent work loss or rollback of revocations; auditable outcomes; retry safely resumes |
| Permanent deletion not approved | Disable, removal, reinstall and ordinary migrations never trigger a purge |

Exercise app, worker, inbound routes and scheduled work, including already-running processes and entitlement refresh. Prove the full chain: install → grants → records → disable → controlled removal → reintroduce → review → enable. Browser E2E proves the administrator journey and real access denial/restoration; documented Storybook interaction tests prove unavailable/review/confirmation/error presentation only and do not replace lifecycle or E2E proof.

Section 1 owns the early compatibility guard and activation contract; Section 2 owns retained authorization; Section 3 owns administrative states; Section 4 proves the real Solutions example; Section 5 owns operator lifecycle proof. Before controlled removal is shipped, resolve durable lifecycle state, removal-side reconciliation transaction ownership, dependency/work cancellation and resumption contracts, external revocation evidence, and review invalidation under concurrent grant changes. These mechanisms remain open, not the accepted retention/restoration policy. New-module registration is decided: once setup's `seed` step is `done`, the migrator run inserts the disabled row under its advisory lock, after the omission check. The omission check compares with the `tenant_module` rows that exist, so a deployment that never completed `seed` has installed nothing (DEC-50, Registration reconciliation owner, 2026-09-23). Controlled removal state changes share that lock when designed.

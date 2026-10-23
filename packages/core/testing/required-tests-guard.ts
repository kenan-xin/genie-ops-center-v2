import type { RequiredCase } from "./required-tests-validator.ts";

/**
 * The core integration manifest (AC-6, AC-9, R-25a–R-28).
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. Every entry is derived from a named acceptance clause:
 *
 * - AC-6 / R-24 / R-25 / R-28: a fresh database receives the core history and
 *   then each module history, each in its own ledger, and a second start applies
 *   nothing and applies only what is missing, in registry order.
 * - AC-9 / R-25a / R-26 / R-26a: two independent processes contend on the fixed
 *   advisory lock, the loser enters no history and proceeds only after release
 *   or fails at the lock timeout, and one backend session owns the lock, every
 *   history and the cleanup; connection loss, a failed history and uncertain
 *   cleanup preserve the original error and destroy the session.
 * - R-26a / R-27: a failed run releases or destroys the owning connection and
 *   blocks no later run.
 * - D-5 / D-6 (1ia.14): a thrown fn rolls the write back and discards the
 *   after-commit list, a commit runs each entry exactly once after the row is
 *   visible to another session, and the transaction is the context pool's own.
 *
 * The validator itself is shared with the app harness
 * (`apps/genie/testing/required-tests-guard.ts`) through this module's
 * re-export, so no core helper imports an app (R-39).
 */
export * from "./required-tests-validator.ts";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/public-url.integration.test.ts",
    reason:
      "Spec 1 AC-14 and R-70 require the public URL builder to ignore request host headers",
    cases: [
      "PUBLIC_URL link construction (Spec 1 AC-14) builds the identity callback URL from PUBLIC_URL regardless of request Host",
      "PUBLIC_URL link construction (Spec 1 AC-14) builds the email invitation link from PUBLIC_URL regardless of request Host",
      "PUBLIC_URL link construction (Spec 1 AC-14) builds the tokenized download link from PUBLIC_URL regardless of request Host",
    ],
  },
  {
    file: "testing/migrator.integration.test.ts",
    reason:
      "AC-6 and AC-9, R-25a-R-28, require the migrator matrix to run; R-10, 1ia.2.1 requires the already-applied-history-gains-a-migration case to run",
    cases: [
      "the migrator's one reserved session, watched on a real database sends the setting, the lock, every history and the cleanup through one real session",
      "the migrator's one reserved session, watched on a real database leaves the lock with the foreign session it could not take, and takes none itself (negative control)",
      "the migrator against a real database applies core and then each module history on a fresh database",
      "two migrator runs contending for the one lock makes the second wait, apply nothing while it waits, and finish after the release",
      "two migrator runs contending for the one lock gives the second run its lock timeout, and lets a later run finish the same plan",
      "the migrator recovering from a real database failure keeps the original error and destroys the session when the connection is lost",
      "the migrator recovering from a real database failure rolls a failed history back whole, keeps the original error, and blocks no later run",
      "the migrator over an already migrated database applies only what is missing, and applies it in registry order",
      "the migrator over an already migrated database still applies a migration a history's journal gained since the last run",
    ],
  },
  {
    file: "testing/migration-run-compiled-list.integration.test.ts",
    reason: "R-27, R-79, D-13 (1ia.13)",
    cases: [
      "MigrationRun compiled-module guards refuses an installed tenant_module row before any history and deletes nothing",
      "MigrationRun compiled-module guards refuses an installed module ledger before any history and leaves the ledger",
      "MigrationRun compiled-module guards refuses a module omission before a pending core migration and leaves that migration unapplied",
      "MigrationRun compiled-module guards does not register modules until seed is done, then inserts disabled rows idempotently",
      "MigrationRun compiled-module guards starts a fresh database with no drizzle schema and creates an empty module ledger",
      "tenant_module write boundary keeps runtime references allowlisted for the migrator, seed, enable procedure and readers",
    ],
  },
  {
    file: "testing/deployment-tables.integration.test.ts",
    reason:
      "Spec 1 AC-1's first half, R-1, R-1a, R-2 and R-3, and Spec 3 AC-11a and R-86a, require the deployment-table shape proof to run",
    cases: [
      "the Section 1 deployment tables creates the eleven deployment tables with exactly the documented columns",
      "the Section 1 deployment tables gives every table its documented primary key and index shape",
      "the Section 1 deployment tables keeps every person-naming column and tenant_module.category_id nullable",
      "the Section 1 deployment tables keeps the file_blob bytes column in external storage",
      "the Section 1 deployment tables refuses a second row in each single-row table",
      "the Section 3 navigation tables creates category and user_preference with exactly the documented columns",
      "the Section 3 navigation tables gives tenant_module.category_id a nullable foreign key to category.id declared on delete set null",
      "the Section 3 navigation tables sets the category of every module that named a deleted category to null and touches no other row",
      "the Section 3 navigation tables upgrades a database with Section 1 and Section 2 rows and an orphan category id, nulling only that id",
    ],
  },
  {
    file: "testing/integrations.integration.test.ts",
    reason:
      "Spec 1 AC-9 and R-40-R-42 require call-time secret resolution and the no-credential-storage proof",
    cases: [
      "integration resolver against a real database returns non-secret configuration and the live secret at call time without storing the credential",
      "integration resolver against a real database reads a rotated secret at each call and refuses once the environment value is removed",
      "integration resolver against a real database resolves an integration with no secret reference and returns undefined secret",
      "integration resolver against a real database rejects a missing integration id and names the id in the error",
      "integration resolver against a real database names an absent secret reference without exposing another secret in the error or output",
    ],
  },
  {
    file: "testing/file-storage.integration.test.ts",
    reason:
      "Spec 1 AC-8, R-6 and R-32-R-39, D-6 require file storage, sanitizing, link authorization and transaction rollback proof",
    cases: [
      "FileStorage against a real Postgres deployment stores bytes in file_blob and fetches the original bytes with response metadata",
      "FileStorage against a real Postgres deployment stores a hostile SVG only after scripts, handlers, javascript URLs, foreignObject and external references are removed",
      "FileStorage against a real Postgres deployment serves a valid tokenized link and refuses the same link after its expiry",
      "FileStorage against a real Postgres deployment binds the permission and resource to the token rather than fetchLink input",
      "FileStorage against a real Postgres deployment checks permissions through can() before issuing and serving a link",
      "FileStorage against a real Postgres deployment refuses a forged link before reading the principal grants",
      "FileStorage against a real Postgres deployment writes metadata and bytes in the caller transaction so rollback leaves neither",
    ],
  },
  {
    file: "testing/file-storage-boundary.test.ts",
    reason:
      "Spec 1 AC-8 and the Files architecture invariant require the file_blob access boundary check to run",
    cases: [
      "file_blob access boundary keeps runtime references to file_blob inside storage adapters",
      "file_blob access boundary catches a planted fileBlob import under a module adapter directory",
    ],
  },
  {
    file: "testing/mailer.integration.test.ts",
    reason:
      "Spec 1 AC-10 and R-43-R-49 require the adapter, production refusal and development log proofs against the context (log safety, sender quoting and recipient checks are unit tests beside the mailer)",
    cases: [
      "mailer adapters and tenant context selects SMTP and sends both parts from the branded MAIL_FROM through the SMTP sink",
      "mailer adapters and tenant context selects Resend and submits the complete message without a network request",
      "mailer adapters and tenant context refuses an unconfigured production send without logging the link",
      "mailer adapters and tenant context logs the development message and full working link rather than sending it",
    ],
  },
  {
    file: "testing/tenant-context.integration.test.ts",
    reason:
      "R-26a's production cross-check, held by genie-ops-center-v2-wwc, requires the containment proof to run",
    cases: [
      "tenant context database clients rejects the active query when its backend terminates",
    ],
  },
  {
    file: "testing/database-client.integration.test.ts",
    reason:
      "genie-ops-center-v2-lcst: a test-owned client whose session Postgres ends must not fail the run with an uncaught error",
    cases: [
      "a database client a test owns stays handled when the backend of its idle session is terminated",
    ],
  },
  {
    file: "testing/tenant-context-readers.integration.test.ts",
    reason:
      "Spec 1 AC-1 second half and R-5 require reader cache expiry and disabled-module proof",
    cases: [
      "tenant context readers serves cached settings branding and entitlement values without a second database read",
      "tenant context readers rereads settings branding and entitlements after ten seconds without save invalidation",
    ],
  },
  {
    file: "testing/with-transaction.integration.test.ts",
    reason:
      "D-5 and D-6's withTransaction seam, bead 1ia.14's acceptance, requires the transaction and after-commit cases to run",
    cases: [
      "withTransaction against a real database rolls a thrown fn's write back and runs no after-commit entry",
      "withTransaction against a real database commits the write and runs each after-commit entry exactly once, after the commit",
      "withTransaction against a real database refuses an afterCommit kept from a finished transaction inside a second one",
      "withTransaction against a real database serves the transaction from the context's own pool and opens no second connection",
    ],
  },
  {
    file: "testing/ops-runner.integration.test.ts",
    reason:
      "Spec 1 AC-4, AC-13 and AC-17, and R-9, R-10, R-12, R-62 to R-66 and R-76 (1ia.2), require the genie-ops runner and audit helper cases to run",
    cases: [
      "genie-ops migrate runs twice, applies nothing on the second run, and logs pending before SQL",
      "genie-ops migrate writes exactly one success audit row with only allow-listed arguments",
      "genie-ops migrate writes one failing audit row and prints the cause with a nonzero exit",
      "genie-ops parse guards dispatches on the first positional and parses each subcommand independently",
      "genie-ops parse guards does not echo an unexpected positional value or write an audit row",
      "genie-ops parse guards fails before creating a context when parsing rejects",
      "genie-ops break-glass rotate rotates the password, clears the authenticator, sets the forced change and deletes sessions in one transaction, with one audit row (R-60, R-61, AC-13)",
      "genie-ops break-glass rotate refuses a rotation when the deployment has no break-glass account",
      "audit helper fallback writes the outcome to command output when audit_event does not exist",
    ],
  },
  {
    file: "testing/rate-limit.integration.test.ts",
    reason:
      "Spec 2 AC-6 and DEC-31 require the fixed-window counter and its overwrite to run against a real database",
    cases: [
      "the fixed-window rate limit against a real database counts within one window and refuses past the limit",
      "the fixed-window rate limit against a real database overwrites the counter row when the next window begins",
      "the fixed-window rate limit against a real database holds the documented window and count for all four endpoints (R-19, R-20)",
    ],
  },
  {
    file: "testing/break-glass.integration.test.ts",
    reason:
      "Spec 2 AC-3, AC-15, R-30, R-62, R-64, R-65 and R1 require the break-glass lifecycle, the R1 session guard and the limited-session refusal to run against a real database and the real instance",
    cases: [
      "the break-glass lifecycle against a real database refuses a non-break-glass credential with a neutral message and no session (R-62)",
      "the break-glass lifecycle against a real database refuses the eleventh break-glass attempt and writes one auth:rate_limited row (R-19 to R-21)",
      "the break-glass lifecycle against a real database lets a break-glass credential sign in and writes one auth:break_glass_sign_in row (R-44, R-45)",
      "the break-glass lifecycle against a real database guards every session: break-glass only from the credential path, an ordinary person only from the realm (R1, R-62)",
      "the break-glass lifecycle against a real database refuses a limited break-glass session in can() and by every router except the two endpoints that clear it (R-30)",
      "the break-glass lifecycle against a real database clears must_change_password when the provisioning password is replaced (R-65)",
      "the break-glass lifecycle against a real database refuses a new password that misses the shared rule (R-64)",
    ],
  },
  {
    file: "testing/break-glass-door.integration.test.ts",
    reason:
      "S2-09 review blockers B1/B2 and L2 require the door's full HTTP flow: the code step is a sign-in, trustDevice is refused, enrollment revokes other sessions, an ordinary session is refused on the break-glass-only endpoints, and the save-time password clause holds",
    cases: [
      "the break-glass door flow against a real database enrollment revokes other sessions, the code step is a sign-in, and trustDevice is refused (B1, B2, R-45)",
      "the break-glass door flow against a real database refuses an ordinary session on the break-glass-only endpoints (L2)",
      "the break-glass door flow against a real database refuses a new password equal to the provisioning one (R-64, L2)",
      "the break-glass door flow against a real database a failed disable writes no audit row and keeps the authenticator (N1)",
      "the break-glass door flow against a real database labels a request with a live session and a fresh challenge as enrollment (N2)",
    ],
  },
  {
    file: "testing/setup.integration.test.ts",
    reason:
      "Spec 1 AC-5, AC-6, AC-10, AC-13, AC-17 and R-18-R-26, R-65, R-77, R-78 require the resumable setup and schema contracts to run",
    cases: [
      "genie-ops setup runs migrations before seed, inserts the configured rows, and leaves a rerun unchanged",
      "genie-ops setup refuses the misplaced tenant.yaml key company_name and names its source file",
      "genie-ops setup resumes after a seed transaction fails without leaving partial seed rows",
      "genie-ops setup writes the migration failure to command output when audit_event does not exist",
    ],
  },
  {
    file: "testing/module-lifecycle.integration.test.ts",
    reason:
      "Spec 1 AC-13, AC-17, AC-19a and R-67-R-69, R-76 require the module activation and retirement command contracts to run",
    cases: [
      "genie-ops module lifecycle module enable writes one success audit row and enables a no-required-config module only after explicit enable",
      "genie-ops module lifecycle module disable writes one success audit row and disables the module",
      "genie-ops module lifecycle module disable refuses a missing registration with one failure audit row and inserts nothing",
      "genie-ops module lifecycle module enable refuses a missing registration with one failure audit row and inserts nothing",
      "genie-ops module lifecycle module disable prints the cause, exits nonzero, and writes one failure audit row",
      "genie-ops module lifecycle module disable skips required-configuration validation",
      "genie-ops module lifecycle module enable refuses a module that is not compiled in with one failure audit row",
      "genie-ops module lifecycle module enable refuses invalid required configuration with actionable issues and without changing the disabled row",
      "genie-ops module lifecycle module enable activates a module with valid required configuration",
      "genie-ops module lifecycle setModuleEnabled writes the same tenant_module row as the module enable command",
      "genie-ops module lifecycle the core procedure reports stable errors and actionable issues for rejected enables",
      "genie-ops retire writes one retirement row and leaves tenant data in place",
      "genie-ops retire retire twice keeps the original retired_at value",
      "genie-ops retire retire prints the cause, exits nonzero, and writes one failure audit row",
      "genie-ops retire --confirm without a retirement row refuses with a clear cause",
      "genie-ops retire --confirm refuses before 90 days with a failure audit row and cause",
      "genie-ops retire --confirm refuses while deletion_hold is set with a failure audit row and cause",
      "genie-ops retire --confirm passes the age and hold checks after 90 days",
    ],
  },
  {
    file: "testing/realm-step.integration.test.ts",
    reason:
      "Spec 2 AC-11 and AC-12 require the realm and clients steps to run against a real Keycloak 26.7.4",
    cases: [
      "the realm and clients setup steps against a real Keycloak creates the brokered realm in one POST with the three clients, PKCE, brute force, the groups mapper and the display name",
      "the realm and clients setup steps against a real Keycloak creates the local-accounts realm with email verification, a password policy, SMTP and the group membership mapper",
      "the realm and clients setup steps against a real Keycloak limits the genie-admin service account to its own realm: no client read, create or secret read",
      "the realm and clients setup steps against a real Keycloak reuses an existing realm when the realm step has no done row after a crash",
      "the realm and clients setup steps against a real Keycloak never writes the bootstrap password or a client secret to the output or the setup_step detail, and resumes after the failed realm step",
      "the realm and clients setup steps against a real Keycloak refuses a missing genie-studio even when the realm error page is not English",
      "the realm and clients setup steps against a real Keycloak refuses when the sign-in client's standard flow is off",
      "the realm and clients setup steps against a real Keycloak refuses the realm step before any network call when the bootstrap credential is absent",
    ],
  },
  {
    file: "testing/worker.integration.test.ts",
    reason:
      "AC-11, R-4, R-5, R-27 and R-50 to R-52 require the pg-boss worker against real Postgres",
    cases: [
      "the core pg-boss worker runs an enqueued placeholder handler and reads from the worker database",
      "the core pg-boss worker does not dequeue a queued job while its migrator waits on the shared advisory lock",
      "the core pg-boss worker starts its own migrator and pg-boss schema without an application process",
      "the core pg-boss worker skips a job of a compiled module with no tenant_module row",
      "the core pg-boss worker schedules a declared job with a cron expression distinct from its data",
      "the core pg-boss worker writes heartbeat from the scheduled core job only after migration completes, then becomes stale when aborted",
      "the core pg-boss worker preserves an application schedule and payload after declaration reconciliation",
      "the core pg-boss worker retries a failed lazy pg-boss start after the database query recovers",
      "the core pg-boss worker does not refresh the heartbeat when declaration schedule reconciliation fails",
      "the core pg-boss worker settles an abandoned handler job and ignores its late result",
    ],
  },
  {
    file: "testing/events.integration.test.ts",
    reason:
      "R-53-R-61, AC-12 and D-5 require the typed event bus acceptance cases",
    cases: [
      "the typed event bus against Testcontainers Postgres does not deliver fast or durable work for an event in a rolled-back transaction",
      "the typed event bus against Testcontainers Postgres delivers committed events to fast and pg-boss handlers",
      "the typed event bus against Testcontainers Postgres keeps an idempotent effect after a durable handler is redelivered",
      "the typed event bus against Testcontainers Postgres enqueues durable work in the caller transaction so rollback discards the job",
      "the typed event bus against Testcontainers Postgres runs one serialized key in emission order while another key runs in parallel",
      "the typed event bus against Testcontainers Postgres runs eight serialized events emitted in one transaction in emission order",
      "the typed event bus against Testcontainers Postgres keeps later serialized jobs in key order after one delivery fails once",
      "the typed event bus against Testcontainers Postgres refuses event emission outside withTransaction even without a fast subscriber",
      "the typed event bus against Testcontainers Postgres does not dispatch a fast event after its savepoint rolls back",
      "the typed event bus against Testcontainers Postgres does not run a disabled module fast subscription and runs it after enable",
      "the typed event bus against Testcontainers Postgres keeps a module-owned durable event queued while its module is disabled",
      "the typed event bus against Testcontainers Postgres does not duplicate subscriptions when runtime registration repeats",
      "the typed event bus against Testcontainers Postgres logs each serialized dead-letter move promptly with its blocked key",
      "the typed event bus against Testcontainers Postgres discards an after-commit entry registered through fn inside a rolled-back savepoint and runs a released one",
      "the typed event bus against Testcontainers Postgres logs the dead-letter move when shutdown fails a last-attempt serialized job",
    ],
  },
  {
    file: "testing/event-correlation.integration.test.ts",
    reason:
      "R-53, R-54 and D-5 require an event to carry the correlation id of the request or event that caused it, across fast handlers, a durable job and a log line",
    cases: [
      "event correlation across a request, its handlers and a durable job carries the request's correlation id through a fast handler chain",
      "event correlation across a request, its handlers and a durable job carries the id through a durable job so a worker-side emit keeps it",
      "event correlation across a request, its handlers and a durable job writes the request's correlation id on the line a durable handler's failure logs",
      "event correlation across a request, its handlers and a durable job writes the chain's correlation id on the line a handler logs",
    ],
  },
  {
    file: "testing/events-kill.integration.test.ts",
    reason:
      "R-55 and D-5 require durable delivery after a hard emitter process death",
    cases: [
      "durable event recovery after a process kill delivers a committed event after its emitting process exits hard",
    ],
  },
  {
    file: "testing/auth-member.integration.test.ts",
    reason:
      "Spec 2 AC-1, R-4 to R-8, R-13, R-17 and R-54d, and DEC-34, require the instance, discovery and break-glass proofs to run",
    cases: [
      "the Better Auth instance the two-context auth isolation test each context holds its own instance and neither answers for the other",
      "the Better Auth instance names the session cookie __Host-genie-session with the secure flag over HTTPS (R-4a)",
      "the Better Auth instance refuses sign-up while email and password sign-in is enabled",
      "the Better Auth instance does not let the update-user endpoint write an input:false application column",
      "the discovery retry and swap builds a fresh instance on the first good answer, so the provider comes back (R-54d)",
    ],
  },
  {
    file: "testing/access.integration.test.ts",
    reason:
      "Spec 2 AC-8 and the named tests of DEC-48 and R-30/R-34 must run: single query, revoke on the next request, limited break-glass refused, navigation omitted with the route still refused",
    cases: [
      "the access seam against a real database reads one assignment query for many calls in one request",
      "the access seam against a real database applies a revoked role on the next request",
      "the access seam against a real database grants a record scope and a declared parent scope, resolving the record once per request",
      "the access seam against a real database resolves parents through the request's tenant and drops an undeclared parent type",
      "the access seam against a real database grants nothing to a banned or erased person, and restores an expired ban",
      "the access seam against a real database refuses a half-null scope at the database",
      "the access seam against a real database answers scopesFor with all for a tenant-wide assignment and the list otherwise",
      "the access seam against a real database grants through a group, and not through an archived group until it is restored",
      "the access seam against a real database lets only an unlimited break-glass account bypass",
      "the access seam against a real database seeds the six core keys and the two system roles without overwriting a changed array",
      "the access seam against a real database appends the module admin key to Tenant administrator on enable and removes it on disable",
      "the access seam against a real database omits a navigation entry whose permission refuses, and the route behind it still refuses",
    ],
  },
  {
    file: "testing/permission-evolution.integration.test.ts",
    reason:
      "Spec 2 AC-25 requires the permission-evolution upgrade matrix against an existing database",
    cases: [
      "permission evolution against an existing database adds a permission and a new system role without granting either to anyone",
      "permission evolution against an existing database renames a system role's display name, keeping its id and assignments",
      "permission evolution against an existing database applies an equivalent permission rename to system and custom roles with the same scopes",
      "permission evolution against an existing database does not broaden an assigned default role when a release declares it wider",
      "permission evolution against an existing database refuses a retired or unknown key while the same role's valid keys keep working",
      "permission evolution against an existing database revokes unsafe authority with an audited transformation and keeps other authority",
      "permission evolution against an existing database applies a transformation once under concurrent starts and retries",
      "permission evolution against an existing database exposes no partial transformation after a failure, fails the start, and a repaired retry completes",
      "permission evolution against an existing database covers a new record with a broad grant and not with a narrow one",
    ],
  },
  {
    file: "testing/navigation-tree.integration.test.ts",
    reason: "Spec 3 AC-4 tree parts, R-28 to R-30 and R-91",
    cases: [
      "the navigation tree against a real database a holder of the use key lands on the landing route and sees its entries move under the module's category",
      "the navigation tree against a real database a person without the use key sees no workspace entry and no landing route, and an auditor sees only the audit log",
      "the navigation tree against a real database a disabled landing module leaves the tree and the landing route",
      "the navigation tree against a real database deleting the category returns the module's entries to the workspace block",
    ],
  },
  {
    file: "testing/retained-access.integration.test.ts",
    reason: "Spec 2 AC-26 requires the retained-access lifecycle fixture",
    cases: [
      "retained access across removal and reintroduction grants nothing for the absent module while unrelated keys in a mixed role keep working",
      "retained access across removal and reintroduction lets an unavailable grant be removed while the module is absent",
      "retained access across removal and reintroduction stays ineffective after reinstall until the module is enabled",
      "retained access across removal and reintroduction restores only the remaining valid grants on explicit enable",
    ],
  },
  {
    file: "testing/audit-reader.integration.test.ts",
    reason:
      "Spec 2 AC-16 and R-67 to R-69 require the audit reader's authorization, keyset paging, operator filter, stored-column search and resolver-gated target link against real Postgres",
    cases: [
      "the audit reader against a real database refuses a caller without core:audit:read and reads nothing",
      "the audit reader against a real database refuses an anonymous caller",
      "the audit reader against a real database pages newest first across equal timestamps with no gap and no repeat",
      "the audit reader against a real database selects operator rows by a null actor and an ops: action only",
      "the audit reader against a real database treats LIKE metacharacters as literal text",
      "the audit reader against a real database shows a live target only when the viewer may open the record, else it looks removed",
      "the audit reader against a real database opens an admin path only for the permission the resolver named",
      "the audit reader against a real database resolves a target once per request, even when the grant is a declared parent",
    ],
  },
  {
    file: "testing/modules-page.integration.test.ts",
    reason:
      "Spec 3 R-82 to R-91a and R-90a require the Modules page service to share the enable procedure and write its own core audit row",
    cases: [
      "the modules page service against a real database the page and the command line write the same tenant_module row",
      "the modules page service against a real database a page switch writes one core row and no ops row; a command run writes one ops row and no core row",
      "the modules page service against a real database a repeated switch writes no audit row",
      "the modules page service against a real database an enable with an invalid stored config refuses with issues, leaves the row off, writes no audit row",
      "the modules page service against a real database listModules lists compiled modules in image order, maps a dangling category id to null, lists holders of <id>:use and keeps holders of a disabled module",
      "the modules page service against a real database setModuleCategory refuses a module with no workspace entry and an unknown category, places a disabled module, writes one core:module_category_set row",
      "the modules page service against a real database a repeated placement changes nothing and writes no audit row",
    ],
  },
  {
    file: "testing/categories-page.integration.test.ts",
    reason:
      "Spec 3 R-87 to R-90a require the Categories page service's counts, its audit row per change and a delete that touches no module table",
    cases: [
      "the categories page service against a real database create, rename, reorder and delete each write exactly one audit row with its R-90a action",
      "the categories page service against a real database counts come from tenant_module.category_id of compiled placeable modules, and the ungrouped count includes a dangling id",
      "the categories page service against a real database delete leaves members ungrouped and changes no row outside category and tenant_module",
      "the categories page service against a real database a duplicate or blank name refuses and writes no row",
      "the categories page service against a real database reorder refuses a list that misses or adds an id",
    ],
  },
  {
    file: "testing/settings-page.integration.test.ts",
    reason:
      "Spec 3 R-72 to R-80, R-90a, AC-10 and AC-19 require one audit row per settings save, refusals with issues, the section permission as an AND, and module saves that never enable",
    cases: [
      "core section saves each core save writes exactly one core:settings_updated row and changes only its own fields",
      "core section saves a save of the stored values answers changed false and writes no audit row",
      "core section saves idle minutes 4 and 481 refuse with settings-invalid and the issue for sessionIdleMinutes; 5 and 480 save",
      "core section saves local accounts on refuses with local-accounts-unavailable while the realm does not support them",
      "module section saves a module save writes exactly one core:module_configured row and the parsed values to tenant_module.config",
      "module section saves refuses an invalid value with settings-invalid and the field issue, and writes nothing",
      "module section saves a disabled module saves valid configuration and stays disabled with the Tenant administrator admin key unchanged",
      "section access (AC-19) baseline only, baseline plus the required key, module key only and no key on reads and writes",
      "section access (AC-19) a compiled module without configuration and a module the image does not compile contribute no section, and saving either answers not-found",
    ],
  },
];

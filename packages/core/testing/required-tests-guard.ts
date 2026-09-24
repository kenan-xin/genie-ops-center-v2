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
    file: "testing/migrator.integration.test.ts",
    reason:
      "AC-6 and AC-9, R-25a-R-28, require the migrator matrix to run; R-10, 1ia.2.1 requires the already-applied-history-gains-a-migration case to run",
    cases: [
      "the migrator's one reserved session, watched on a real database sends the setting, the lock, every history and the cleanup through one real session",
      "the migrator's one reserved session, watched on a real database leaves the lock with the foreign session it could not take, and takes none itself (negative control)",
      "the migrator against a real database applies core and then each module history on a fresh database",
      "the migrator against a real database applies nothing the second time it runs over the same database",
      "the migrator against a real database holds no advisory lock once a run has finished",
      "the migrator against a real database waits for the lock, gives up at the limit and applies nothing",
      "the migrator against a real database keeps the original error when a history fails, and blocks no later run",
      "two migrator runs contending for the one lock makes the second wait, apply nothing while it waits, and finish after the release",
      "two migrator runs contending for the one lock gives the second run its lock timeout, and lets a later run finish the same plan",
      "the migrator recovering from a real database failure keeps the original error and destroys the session when the connection is lost",
      "the migrator recovering from a real database failure fails the start and destroys the session when the lock is gone by cleanup time",
      "the migrator recovering from a real database failure rolls a failed history back whole, leaving no half applied table",
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
      "MigrationRun compiled-module guards does not register modules until seed is done, then inserts disabled rows idempotently",
      "MigrationRun compiled-module guards starts a fresh database with no drizzle schema and creates an empty module ledger",
      "tenant_module write boundary keeps runtime references allowlisted for the migrator, seed, enable procedure and readers",
    ],
  },
  {
    file: "testing/deployment-tables.integration.test.ts",
    reason:
      "Spec 1 AC-1's first half, R-1, R-1a, R-2 and R-3, requires the deployment-table shape proof to run",
    cases: [
      "the Section 1 deployment tables creates the eleven deployment tables with exactly the documented columns",
      "the Section 1 deployment tables gives every table its documented primary key and index shape",
      "the Section 1 deployment tables does not create the Section 3 tables category and user_preference",
      "the Section 1 deployment tables leaves every person-naming column and tenant_module.category_id nullable with no foreign key",
      "the Section 1 deployment tables keeps the file_blob bytes column in external storage",
      "the Section 1 deployment tables refuses a second row in each single-row table",
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
      "integration resolver against a real database returns integration status so the caller can decide whether to use it",
      "integration resolver against a real database names an absent secret reference without exposing another secret in the error or output",
    ],
  },
  {
    file: "testing/tenant-context.integration.test.ts",
    reason:
      "R-26a's production cross-check, held by genie-ops-center-v2-wwc, requires the containment proof to run",
    cases: [
      "tenant context database clients keeps an error listener while a client is checked out",
      "tenant context database clients rejects the active query when its backend terminates",
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
      "audit helper fallback writes the outcome to command output when audit_event does not exist",
    ],
  },
  {
    file: "testing/setup.integration.test.ts",
    reason:
      "Spec 1 AC-5, AC-6, AC-10, AC-13, AC-17 and R-18-R-26, R-65, R-77, R-78 require the resumable setup and schema contracts to run",
    cases: [
      "genie-ops setup runs migrations before seed, inserts the configured rows, and leaves a rerun unchanged",
      "genie-ops setup applies each tenant setting default when tenant.yaml omits it",
      "genie-ops setup refuses the misplaced tenant.yaml key company_name and names its source file",
      "genie-ops setup refuses the misplaced branding.seed.json key modules and names its source file",
      "genie-ops setup resumes after a seed transaction fails without leaving partial seed rows",
      "genie-ops setup completes without mail variables and logs fresh-database migration progress",
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
      "genie-ops module lifecycle module enable refuses missing required configuration without changing the disabled row",
      "genie-ops module lifecycle module enable refuses invalid required configuration with actionable issues and without changing the disabled row",
      "genie-ops module lifecycle module enable activates a module with valid required configuration",
      "genie-ops module lifecycle setModuleEnabled writes the same tenant_module row as the module enable command",
      "genie-ops module lifecycle setModuleEnabled reports transitions and preserves enabled_at on repeated enable and disable",
      "genie-ops module lifecycle setModuleEnabled refuses to enable an unregistered module without inserting a row",
      "genie-ops module lifecycle setModuleEnabled refuses to disable an unregistered module without inserting a row",
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
    file: "testing/setup-step-latch.integration.test.ts",
    reason:
      "D-2, the setup lifecycle latch guard, requires a completed step to survive setup rerun",
    cases: [
      "the setup gate latch keeps every completed setup step done after a setup rerun",
    ],
  },
];

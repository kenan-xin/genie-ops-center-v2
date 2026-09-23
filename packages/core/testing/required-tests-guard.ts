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
 *
 * The validator itself is shared with the app harness
 * (`apps/genie/testing/required-tests-guard.ts`) through this module's
 * re-export, so no core helper imports an app (R-39).
 */
export * from "./required-tests-validator.ts";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/migrator.integration.test.ts",
    reason: "AC-6 and AC-9, R-25a-R-28, require the migrator matrix to run",
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
];

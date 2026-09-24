import type { RedactingLogger } from "../../services/logging/index.ts";
import type { TenantContext } from "./index.ts";

/**
 * The logger each context was built with, kept off the context object. `createTenantContext` is
 * the only writer and `withTransaction` the only reader, so the context keeps its two fixed
 * members (R-18) and no logger member reaches a caller. A context the factory did not build has
 * no entry, which is a programming error rather than a condition to swallow silently.
 */
const contextLoggers = new WeakMap<
  TenantContext,
  Pick<RedactingLogger, "error">
>();

/**
 * Records the process logger for one context. Called by `createTenantContext` only; it is not
 * exported from the package root, so no caller can attach a logger to a context after the fact.
 */
export function registerContextLogger(
  context: TenantContext,
  logger: Pick<RedactingLogger, "error">
): void {
  contextLoggers.set(context, logger);
}

/**
 * The transaction `withTransaction` hands a caller: the context's own drizzle transaction, so a
 * write it makes commits or rolls back with the caller's work and no second connection opens.
 */
export type TenantTransaction = Parameters<
  Parameters<TenantContext["db"]["transaction"]>[0]
>[0];

/** One deferred side effect, run after the commit. It must tolerate running at least once. */
export type AfterCommitEntry = () => void | Promise<void>;

/** Registers an entry to run after the commit. Registration happens inside `fn` only. */
export type AfterCommit = (entry: AfterCommitEntry) => void;

/**
 * Runs the registered entries once each, in order, awaiting each before the next. The commit
 * already happened, so an entry's failure cannot roll it back and must not reject the caller: it
 * is recorded through the context's logger and the later entries still run (R-53, D-5).
 */
async function runAfterCommit(
  entries: readonly AfterCommitEntry[],
  logger: Pick<RedactingLogger, "error">
): Promise<void> {
  for (const entry of entries) {
    try {
      // Entries run in registration order, each awaited, so a later entry observes an earlier
      // one's effect. A failure is recorded and never stops the rest.
      // oxlint-disable-next-line no-await-in-loop
      await entry();
    } catch (error) {
      // The redacting logger turns the error into a line; nothing is swallowed silently.
      logger.error({ err: error }, "after-commit entry failed");
    }
  }
}

/**
 * Runs `fn` in one transaction over the context's pool and, once the commit is durable, hands the
 * registered entries to `runAfterCommit`.
 *
 * The list is discarded when `fn` throws: drizzle rolls the transaction back and the error
 * propagates, so no entry runs (R-54). A context not built by `createTenantContext` has no logger
 * entry, so the call throws rather than swallow the failure.
 */
export async function withTransaction<T>(
  context: TenantContext,
  fn: (tx: TenantTransaction, afterCommit: AfterCommit) => Promise<T>
): Promise<T> {
  const logger = contextLoggers.get(context);

  if (logger === undefined) {
    throw new Error(
      "withTransaction needs a context built by createTenantContext."
    );
  }

  const entries: AfterCommitEntry[] = [];

  const afterCommit: AfterCommit = (entry) => {
    entries.push(entry);
  };

  const result = await context.db.transaction((tx) => fn(tx, afterCommit));

  await runAfterCommit(entries, logger);

  return result;
}

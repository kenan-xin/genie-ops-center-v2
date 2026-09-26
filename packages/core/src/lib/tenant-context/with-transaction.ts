import { AsyncLocalStorage } from "node:async_hooks";

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

/** The transaction, or savepoint, that the running code holds, with its after-commit register. */
type Scope = {
  readonly tx: TenantTransaction;
  readonly register: AfterCommit;
};

/**
 * Marks the async context of a running `withTransaction` with its transaction and after-commit
 * registration, so any call made inside `fn` is refused instead of opening a second, independent
 * top-level transaction, and a service that emits into the transaction can find the list. A
 * savepoint opened with `tx.transaction(...)` marks its own callback the same way. The store
 * follows the async tree, so two concurrent calls in separate chains never see each other's mark.
 */
const transactionScope = new AsyncLocalStorage<Scope>();

/**
 * The after-commit registration of `tx`, which must be the transaction or savepoint that the
 * innermost running `withTransaction` handed the caller. The event bus is the caller: `events.emit`
 * runs inside `fn` and its fast handlers belong to that transaction's commit, so it takes the
 * register from here rather than a second parameter. Any other transaction throws, a raw
 * `db.transaction` included, because its commit is not one a fast handler can follow.
 */
export function currentAfterCommit(tx: TenantTransaction): AfterCommit {
  const scope = transactionScope.getStore();

  if (scope === undefined) {
    throw new Error(
      "events.emit requires withTransaction: an event is emitted inside the transaction whose commit delivers it."
    );
  }

  if (scope.tx !== tx) {
    throw new Error(
      "events.emit takes the transaction that withTransaction, or a savepoint inside it, handed this code."
    );
  }

  return scope.register;
}

/**
 * Gives each savepoint opened with `tx.transaction(...)` its own after-commit list, which joins the
 * parent's list only once the savepoint is released. A savepoint that rolls back discards its
 * registrations with its writes, so a fast handler never runs for an event its durable job lost
 * (R-54, D-5). Nested savepoints are scoped the same way.
 */
function scopeSavepoints(tx: TenantTransaction, register: AfterCommit): void {
  const open = tx.transaction.bind(tx);

  tx.transaction = async (fn) => {
    const list = openAfterCommitList();

    const result = await open(async (savepoint) =>
      transactionScope.run(
        { tx: savepoint, register: list.register },
        async () => {
          scopeSavepoints(savepoint, list.register);

          try {
            return await fn(savepoint);
          } finally {
            list.close();
          }
        }
      )
    );

    for (const entry of list.entries) register(entry);

    return result;
  };
}

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

/**
 * One deferred side effect, run after the commit. It runs at most once and is never retried: a
 * crash between the commit and the dispatch loses it.
 */
export type AfterCommitEntry = () => void | Promise<void>;

/**
 * Registers an entry to run after the commit. It may be called only while `fn` runs; a call after
 * `fn` settles throws, because the seam has already taken the list.
 */
export type AfterCommit = (entry: AfterCommitEntry) => void;

/**
 * The after-commit list a caller fills while `fn` runs. It closes when `fn` settles, so a
 * registration after that throws instead of adding an entry that silently never runs.
 */
function openAfterCommitList() {
  const entries: AfterCommitEntry[] = [];
  let open = true;

  return {
    register: (entry: AfterCommitEntry): void => {
      if (!open) {
        throw new Error("afterCommit can only be called while fn runs.");
      }

      entries.push(entry);
    },
    entries,
    close: () => {
      open = false;
    },
  };
}

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
 * propagates, so no entry runs (R-54). Registration closes when `fn` settles, so an `afterCommit`
 * call after that throws instead of adding an entry that silently never runs.
 *
 * Any nested `withTransaction` is refused, whatever the context: it opens an independent top-level
 * transaction that cannot commit or roll back with the outer one. On the same context it also
 * takes a second pool client and can deadlock on a row the outer transaction holds. Use
 * `tx.transaction(...)` inside `fn` for a savepoint instead. A context not built by
 * `createTenantContext` has no logger entry, so the call throws rather than swallow the failure.
 */
export async function withTransaction<T>(
  context: TenantContext,
  fn: (tx: TenantTransaction, afterCommit: AfterCommit) => Promise<T>
): Promise<T> {
  if (transactionScope.getStore() !== undefined) {
    throw new Error(
      "withTransaction cannot be nested. Use tx.transaction(...) inside fn for a savepoint."
    );
  }

  const logger = contextLoggers.get(context);

  if (logger === undefined) {
    throw new Error(
      "withTransaction needs a context built by createTenantContext."
    );
  }

  const afterCommit = openAfterCommitList();

  const result = await context.db.transaction(async (tx) => {
    scopeSavepoints(tx, afterCommit.register);

    return transactionScope.run(
      { tx, register: afterCommit.register },
      async () => {
        try {
          return await fn(tx, afterCommit.register);
        } finally {
          // Close registration the moment `fn` settles, before the commit, so a late call from an
          // un-awaited promise inside `fn` throws instead of running or vanishing silently.
          afterCommit.close();
        }
      }
    );
  });

  await runAfterCommit(afterCommit.entries, logger);

  return result;
}

import { AsyncLocalStorage } from "node:async_hooks";

import type { RedactingLogger } from "../../services/logging/index.ts";
import type { TenantContext } from "./index.ts";

/**
 * The logger each context was built with, kept off the context object. `createTenantContext` is
 * the only writer and `withTransaction` the only reader, so the context keeps its two fixed
 * members (R-18) and no logger member reaches a caller. A context the factory did not build has
 * no entry, which is a programming error rather than a condition to swallow silently.
 *
 * Both this map and the transaction scope below live on the process global (like the application
 * context slot in `apps/genie/src/context.ts`), because the framework compiles one source file
 * into several server bundles: a module-local map would give the bootstrap bundle one registry
 * and a route-handler bundle another, so a write from a procedure would not find the context the
 * bootstrap built. The symbol is process-global, so every bundle instance reaches one map.
 */
const SLOT = Symbol.for("genie.with-transaction.slot");

/**
 * The transaction, or savepoint, that the running code holds, with its after-commit register.
 * `root` is the outer transaction's register, shared by every savepoint inside it, so an
 * `afterCommit` can tell its own transaction from another one running at call time. `context` is
 * the tenant context the transaction belongs to, and `parent` is the scope it was opened inside,
 * so the nested check can reject a context present anywhere in the active chain (A->B->A), not
 * only the nearest scope.
 */
type Scope = {
  readonly tx: TenantTransaction;
  readonly register: AfterCommit;
  readonly root: AfterCommit;
  readonly context: TenantContext;
  readonly parent: Scope | undefined;
};

/**
 * The per-process state `withTransaction` needs, kept on the process global (like the application
 * context slot in `apps/genie/src/context.ts`). The framework compiles one source file into
 * several server bundles, so a module-local map or `AsyncLocalStorage` would give the bootstrap
 * bundle one instance and a route-handler bundle another: `loggers` is the logger each context was
 * built with, and `scope` is the running transaction, which the event bus in another bundle reads.
 */
type TransactionSlot = {
  readonly loggers: WeakMap<TenantContext, Pick<RedactingLogger, "error">>;
  readonly scope: AsyncLocalStorage<Scope>;
};

function slot(): TransactionSlot {
  // SAFETY: this module is the only writer of the slot under this symbol, and it writes a
  // TransactionSlot; a bundle that reads before any writer seeds one below.
  const store = globalThis as Record<symbol, TransactionSlot | undefined>;
  const existing = store[SLOT];

  if (existing !== undefined) return existing;

  const created: TransactionSlot = {
    loggers: new WeakMap(),
    scope: new AsyncLocalStorage(),
  };

  store[SLOT] = created;

  return created;
}

/**
 * The after-commit registration of `tx`, which must be the transaction or savepoint that the
 * innermost running `withTransaction` handed the caller. The event bus is the caller: `events.emit`
 * runs inside `fn` and its fast handlers belong to that transaction's commit, so it takes the
 * register from here rather than a second parameter. Any other transaction throws, a raw
 * `db.transaction` included, because its commit is not one a fast handler can follow.
 */
export function currentAfterCommit(tx: TenantTransaction): AfterCommit {
  const scope = slot().scope.getStore();

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
function scopeSavepoints(
  tx: TenantTransaction,
  register: AfterCommit,
  root: AfterCommit,
  context: TenantContext
): void {
  const open = tx.transaction.bind(tx);

  tx.transaction = async (fn) => {
    const list = openAfterCommitList();
    const parent = slot().scope.getStore();

    const result = await open(async (savepoint) =>
      slot().scope.run(
        { tx: savepoint, register: list.register, root, context, parent },
        async () => {
          scopeSavepoints(savepoint, list.register, root, context);

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
  slot().loggers.set(context, logger);
}

/**
 * The process logger recorded for one context, or nothing for a context this factory did not
 * build. A service that must record a best-effort failure the transport does not surface - the Add
 * person realm-user compensation, for example - reads it here rather than building its own logger.
 */
export function contextLoggerOf(
  context: TenantContext
): Pick<RedactingLogger, "error"> | undefined {
  return slot().loggers.get(context);
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
 * A nested `withTransaction` on a context already active in the chain is refused: it opens an
 * independent top-level transaction that cannot commit or roll back with the outer one, takes a
 * second pool client, and can deadlock on a row the outer transaction holds. The check walks the
 * whole chain, so A -> B -> A is refused, not only a same-context re-entry in the nearest scope.
 * Use `tx.transaction(...)` inside `fn` for a savepoint instead. A `withTransaction` on a context
 * not already active is allowed, because it opens on that context's own pool and shares no row:
 * two tenant contexts each hold their own transaction in one process (DEC-34). A context not built
 * by `createTenantContext` has no logger entry, so the call throws rather than swallow the failure.
 */
export async function withTransaction<T>(
  context: TenantContext,
  fn: (tx: TenantTransaction, afterCommit: AfterCommit) => Promise<T>
): Promise<T> {
  const parent = slot().scope.getStore();

  for (let scope = parent; scope !== undefined; scope = scope.parent) {
    if (scope.context === context) {
      throw new Error(
        "withTransaction cannot be nested. Use tx.transaction(...) inside fn for a savepoint."
      );
    }
  }

  const logger = slot().loggers.get(context);

  if (logger === undefined) {
    throw new Error(
      "withTransaction needs a context built by createTenantContext."
    );
  }

  const afterCommit = openAfterCommitList();

  /**
   * The `afterCommit` argument `fn` receives. It resolves the innermost scope at call time, so an
   * entry registered inside `tx.transaction(...)` joins that savepoint's list: a rolled-back
   * savepoint discards it and a released one merges it into the parent, exactly like a fast
   * handler emitted there (R-54, D-5). A call outside this transaction's scope throws: after `fn`
   * settles, from an async chain `fn` did not start, or inside another `withTransaction` that is
   * running, whose commit this entry must not follow.
   */
  const registerAfterCommit: AfterCommit = (entry) => {
    const scope = slot().scope.getStore();

    if (scope === undefined) {
      throw new Error("afterCommit can only be called while fn runs.");
    }

    if (scope.root !== afterCommit.register) {
      throw new Error(
        "afterCommit was called inside another withTransaction. It registers only on the transaction that handed it to fn."
      );
    }

    scope.register(entry);
  };

  const result = await context.db.transaction(async (tx) => {
    scopeSavepoints(tx, afterCommit.register, afterCommit.register, context);

    return slot().scope.run(
      {
        tx,
        register: afterCommit.register,
        root: afterCommit.register,
        context,
        parent,
      },
      async () => {
        try {
          return await fn(tx, registerAfterCommit);
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

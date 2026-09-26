import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss, type SendOptions } from "pg-boss";
import { v7 as uuidv7 } from "uuid";

import type { EventContract, EventEnvelope } from "../../../contracts/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  currentAfterCommit,
  type TenantTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import { bossOf, type JobQueue } from "../job-queue/index.ts";
import type { RedactingLogger } from "../logging/index.ts";

/** One event handler: the envelope and the one tenant context, like every job (DEC-34). */
export type EventHandler<TPayload> = (
  event: EventEnvelope<TPayload>,
  context: TenantContext
) => Promise<void>;

/**
 * How a subscription is delivered (R-53). No option is fast; the durable options are below. Only a
 * module's declared `subscriptions` may set them: `context.events.on` refuses both, because only
 * the declared list is registered by the worker that drains the queues. A durable or serialized
 * subscription also carries a `name`, required by `validateModule` and unique within its module,
 * which its queue name derives from so reordering the declared list never reroutes an in-flight
 * job.
 */
export type SubscriptionOptions<TPayload> = {
  /**
   * The subscription's stable identity. Required for a durable or serialized subscription, whose
   * queue name is derived from it, so a deploy that reorders same-mode subscriptions keeps every
   * in-flight job on its own handler. A fast subscription needs no name.
   */
  readonly name?: string;
  /**
   * Runs the handler as a pg-boss job enqueued inside the emitting transaction, so the job
   * commits or rolls back with the data and delivery is at least once (D-5, R-55).
   */
  readonly durable?: boolean;
  /**
   * Implies durable, and runs the jobs for one key one at a time in emission order on a
   * `key_strict_fifo` queue, while different keys run in parallel (R-56).
   */
  readonly serializeBy?: (payload: TPayload) => string;
};

/**
 * The typed event bus on the tenant context (R-53). `emit` is called inside `withTransaction`:
 * it validates the payload with the contract's schema, registers the fast handlers on that
 * transaction's after-commit list, and enqueues each durable subscription's pg-boss job on the
 * caller's transaction, so a rollback discards everything (R-54, D-5).
 */
export type EventBus = {
  readonly emit: <TPayload>(
    tx: TenantTransaction,
    event: EventContract<string, TPayload>,
    payload: TPayload
  ) => Promise<void>;
  readonly on: <TPayload>(
    event: EventContract<string, TPayload>,
    handler: EventHandler<TPayload>,
    options?: SubscriptionOptions<TPayload>
  ) => void;
};

/** One durable subscription's queue, as the worker drains it. */
export type DurableEventQueue = {
  readonly queue: string;
  /** The declared dead-letter queue, present exactly on a serialized queue (R-57). */
  readonly deadLetter: string | undefined;
  /** The module whose entitlement gates this queue's jobs. */
  readonly ownerModuleId: string;
  readonly handler: (
    event: EventEnvelope<never>,
    context: TenantContext
  ) => Promise<void>;
};

type DurableEntry = DurableEventQueue & {
  readonly serializeBy: ((payload: never) => string) | undefined;
};

/** One fast handler, with the module whose entitlement gates it; a direct `on` has none. */
type FastEntry = {
  readonly handler: EventHandler<never>;
  readonly ownerModuleId: string | undefined;
};

type Internals = {
  readonly fastByEvent: Map<string, FastEntry[]>;
  readonly durableByEvent: Map<string, DurableEntry[]>;
  readonly queues: Map<string, Promise<PgBoss>>;
  /** Every durable queue name registered, so two subscriptions never share one queue. */
  readonly durableQueueNames: Set<string>;
};

/** The internals of each bus, kept off the context's public member. */
const buses = new WeakMap<EventBus, Internals>();

const contractKey = (event: {
  readonly name: string;
  readonly version: number;
}): string => `${event.name}@v${event.version}`;

/**
 * One subscription's queue name. The event's own name and version decide the delivery contract,
 * the owning module's id keeps two subscribers apart, the mode keeps one module's durable and
 * serialized subscriptions to the same event apart, and the subscription's `name` disambiguates a
 * repeated subscription of the same mode. The name never comes from the declaration index, so
 * reordering same-mode subscriptions between releases keeps each in-flight job on its handler
 * (R-56). A subscription without a name (only possible outside `validateModule`) falls back to the
 * event itself, which is stable but collides with another unnamed subscription of the same mode; `register`
 * refuses that collision.
 */
function queueName(
  ownerModuleId: string,
  event: { readonly name: string; readonly version: number },
  mode: "durable" | "fifo",
  name: string | undefined
): string {
  const base = `event.${ownerModuleId}.${event.name}.v${event.version}${
    mode === "fifo" ? ".fifo" : ""
  }`;

  return name === undefined || name === "" ? base : `${base}.${name}`;
}

function intern(bus: EventBus): Internals {
  const internals = buses.get(bus);

  if (internals === undefined) {
    throw new Error("This event bus was not built by createEventBus.");
  }

  return internals;
}

/**
 * The one registration path behind `on` and `registerSubscription`. A subscription with no
 * durable option joins the fast list of its event; a durable or serialized one takes a queue of
 * its own, named after the module that declared it. A direct `on` has no module, so it may only
 * register a fast handler.
 */
function register(
  bus: EventBus,
  ownerModuleId: string | undefined,
  event: EventContract<string, unknown>,
  handler: EventHandler<never>,
  options: {
    readonly name?: string;
    readonly durable?: boolean;
    readonly serializeBy?: (payload: never) => string;
  }
): void {
  const key = contractKey(event);
  const internals = intern(bus);

  // serializeBy is durable delivery, so `durable: false` beside it contradicts it (R-56).
  if (options.durable === false && options.serializeBy !== undefined) {
    throw new Error(
      `Subscription to "${event.name}" sets serializeBy with durable false. serializeBy delivers durably.`
    );
  }

  if (options.durable !== true && options.serializeBy === undefined) {
    const handlers = internals.fastByEvent.get(key) ?? [];

    handlers.push({ handler, ownerModuleId });
    internals.fastByEvent.set(key, handlers);

    return;
  }

  if (ownerModuleId === undefined) {
    throw new Error(
      `events.on("${event.name}") is fast only. Declare a durable or serialized subscription in the module's subscriptions, which the worker drains.`
    );
  }

  const serialized = options.serializeBy !== undefined;
  const mode = serialized ? "fifo" : "durable";
  const queue = queueName(ownerModuleId, event, mode, options.name);
  const deadLetter = serialized ? `${queue}.dead-letter` : undefined;

  // Two subscriptions on one queue would each take the other's jobs with no error: two unnamed
  // subscriptions of one mode on one event, or dotted names that join to the same string, a
  // queue and another subscription's dead-letter queue included.
  for (const name of [queue, deadLetter]) {
    if (name !== undefined && internals.durableQueueNames.has(name)) {
      throw new Error(
        `Subscription to "${event.name}" in module "${ownerModuleId}" resolves to the queue "${name}", which another subscription already uses. Give each subscription its own name.`
      );
    }
  }

  internals.durableQueueNames.add(queue);

  if (deadLetter !== undefined) internals.durableQueueNames.add(deadLetter);

  const entry: DurableEntry = {
    queue,
    deadLetter,
    ownerModuleId,
    handler,
    serializeBy: options.serializeBy,
  };

  const subscriptions = internals.durableByEvent.get(key) ?? [];

  subscriptions.push(entry);
  internals.durableByEvent.set(key, subscriptions);
}

/**
 * Builds the tenant context's event bus. It holds no connection: the durable channel goes through
 * the context's job queue, whose pg-boss instance starts on the first use, and the fast channel
 * runs from the emitting transaction's after-commit list. `tenant` is a thunk because the context
 * object this bus hangs from is finished only after this factory returns.
 */
export function createEventBus(input: {
  readonly jobQueue: JobQueue;
  readonly logger: Pick<RedactingLogger, "error">;
  readonly tenant: () => TenantContext;
}): EventBus {
  const internals: Internals = {
    fastByEvent: new Map(),
    durableByEvent: new Map(),
    queues: new Map(),
    durableQueueNames: new Set(),
  };

  async function ensureQueue(entry: DurableEntry): Promise<PgBoss> {
    // One creation in flight per queue, so the first emit of an event does the work and the rest
    // share it. A failed creation is forgotten, so the next emit retries it.
    let created = internals.queues.get(entry.queue);

    if (created === undefined) {
      created = (async () => {
        const boss = await bossOf(input.jobQueue);

        // A dead-letter queue is created before the queue that names it, because pg-boss refuses
        // to reference one that does not exist (R-57).
        if (entry.deadLetter !== undefined)
          await boss.createQueue(entry.deadLetter);

        await boss.createQueue(
          entry.queue,
          entry.deadLetter === undefined
            ? {}
            : { policy: "key_strict_fifo", deadLetter: entry.deadLetter }
        );

        return boss;
      })().catch((error: Error) => {
        internals.queues.delete(entry.queue);

        throw error;
      });

      internals.queues.set(entry.queue, created);
    }

    return created;
  }

  const bus: EventBus = {
    on: (event, handler, options) =>
      register(
        bus,
        undefined,
        event,
        // SAFETY: the erased registry stores every handler against `never`, which each authored
        // payload satisfies; the bus hands back the same envelope it parsed.
        handler as EventHandler<never>,
        // SAFETY: the durable flags are the only members the erased registrar reads; the payload
        // type around serializeBy erases to `never` the same way.
        (options ?? {}) as {
          durable?: boolean;
          serializeBy?: (payload: never) => string;
        }
      ),

    emit: async (tx, event, payload) => {
      // Taken first and always, so an emit on a transaction withTransaction did not open throws
      // whether or not the event has a fast subscriber today (D-5).
      const afterCommit = currentAfterCommit(tx);
      // The parse runs before anything is registered, so an invalid payload throws inside the
      // transaction and the whole emission rolls back with it.
      const parsed = event.payload.parse(payload);
      const key = contractKey(event);

      const envelope: EventEnvelope<unknown> = {
        id: randomUUID(),
        name: event.name,
        version: event.version,
        payload: parsed,
        correlationId: randomUUID(),
        emittedAt: new Date().toISOString(),
      };

      const fast = internals.fastByEvent.get(key);

      if (fast !== undefined && fast.length > 0) {
        // The fast channel runs once the commit is durable, at most once and best effort: a crash
        // between the commit and the dispatch loses it (R-53, D-5). A failing handler is recorded
        // and never stops its siblings or rejects the committed caller. A module's handler runs only
        // while the module is enabled, like its durable queues (R-60, D-11).
        afterCommit(async () => {
          const tenant = input.tenant();

          for (const { handler, ownerModuleId } of fast) {
            try {
              if (
                ownerModuleId !== undefined &&
                // oxlint-disable-next-line no-await-in-loop -- the reader is cached for 10 s
                !(await tenant.entitlements.isEnabled(ownerModuleId))
              ) {
                continue;
              }

              // SAFETY: the erased registry hands every handler the envelope it was given, whose
              // payload this emit just parsed with the event's own schema.
              // oxlint-disable-next-line no-await-in-loop -- siblings observe each other's effects
              await handler(envelope as EventEnvelope<never>, tenant);
            } catch (error) {
              input.logger.error(
                { err: error, event: event.name },
                "fast event handler failed"
              );
            }
          }
        });
      }

      /* oxlint-disable no-await-in-loop -- each send runs on the caller's one transaction
         connection, which cannot pipeline; order of the sends is the emission order. */
      for (const entry of internals.durableByEvent.get(key) ?? []) {
        // D-5: the job is sent through pg-boss on the caller's transaction, so it commits or rolls
        // back with the data. A serialized job carries the key as singletonKey, which the
        // key_strict_fifo policy requires, at the default priority (R-56). Each send awaits its
        // turn: they all run on the caller's one transaction connection, which cannot pipeline.
        // Every job of one transaction gets the same created_on, the transaction start, so a key's
        // head falls to the id tie-break: a UUIDv7 minted here, monotonic in this process, keeps
        // the same-key jobs of one transaction in emission order.
        const boss = await ensureQueue(entry);
        const options: SendOptions = { db: fromDrizzle(tx, sql), id: uuidv7() };

        if (entry.serializeBy !== undefined) {
          // SAFETY: the key function was registered against this event's payload type; the value
          // passed here is that same payload after the schema's parse.
          options.singletonKey = entry.serializeBy(parsed as never);
        }

        await boss.send(entry.queue, envelope, options);
      }
      /* oxlint-enable no-await-in-loop */
    },
  };

  buses.set(bus, internals);

  return bus;
}

/**
 * Registers one module-declared subscription, recording the module whose entitlement gates the
 * queue the worker drains it from. Called by `registerModuleRuntime`; a module never calls it.
 */
export function registerSubscription(
  bus: EventBus,
  ownerModuleId: string,
  subscription: {
    readonly event: EventContract<string, unknown>;
    readonly handler: EventHandler<never>;
    readonly name?: string;
    readonly durable?: boolean;
    readonly serializeBy?: (payload: never) => string;
  }
): void {
  register(
    bus,
    ownerModuleId,
    subscription.event,
    subscription.handler,
    subscription
  );
}

/** Every durable subscription registered on this bus, as the worker drains them. */
export function durableEventQueues(
  bus: EventBus
): readonly DurableEventQueue[] {
  return [...intern(bus).durableByEvent.values()].flat();
}

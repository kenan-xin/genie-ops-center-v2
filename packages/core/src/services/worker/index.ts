import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import type { PgBoss } from "pg-boss";

import {
  type EnvironmentSource,
  validateEnvironment,
} from "../../lib/environment/index.ts";
import type {
  JobDeclaration,
  Module,
} from "../../lib/module-contract/module.ts";
import { registerModuleRuntime } from "../../lib/module-contract/runtime.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../../lib/tenant-context/index.ts";
import { causeChain } from "../../utils/error-cause.ts";
import {
  durableEventQueues,
  type DurableEventQueue,
} from "../event-bus/index.ts";
import {
  createBoss,
  DECLARATION_SCHEDULE_KEY_PREFIX,
  type CronTiming,
  type JobData,
  stopJobQueue,
} from "../job-queue/index.ts";
import {
  createLogger,
  type RedactingLogger,
  redact,
} from "../logging/index.ts";
import {
  type MigrationHistory,
  migrationPlan,
  runMigrations,
} from "../migrator/index.ts";

/** Where the heartbeat file goes when `WORKER_HEARTBEAT_PATH` is unset (environment contract). */
export const DEFAULT_WORKER_HEARTBEAT_PATH = "/tmp/genie-worker-heartbeat";

/** The core queue whose job writes the heartbeat. Core owns it, so no entitlement gates it. */
export const HEARTBEAT_JOB = "core.worker-heartbeat";

/** Every minute, so a health check that allows three minutes tolerates two missed passes. */
const HEARTBEAT_CRON = "* * * * *";

/** Thrown inside a loop when its handler settles after the shutdown timeout, to end the loop. */
const ABANDONED = new Error("abandoned at shutdown");

/** How long a queue loop waits after it finds no job, or finds its module disabled. */
const POLL_INTERVAL_MS = 1000;

/**
 * How many event handlers one queue loop may run at once. A serialized queue only ever hands out
 * one job per key, so the bound is the number of keys running in parallel (R-56); a durable queue
 * without serialization is capped here so a backlog cannot start unbounded concurrent handlers.
 */
const MAX_EVENT_HANDLERS_IN_FLIGHT = 16;

/** Below Docker's default 10 s stop grace, so the worker stops pg-boss itself before SIGKILL. */
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8000;

/**
 * The schedule key a declaration owns. A caller's `jobQueue.schedule` uses its own key (empty by
 * default), so reconciling a declaration never overwrites a caller's cron or payload.
 */
const declarationKey = (job: JobDeclaration) =>
  `${DECLARATION_SCHEDULE_KEY_PREFIX}${job.name}`;

/**
 * The jobs the loops fetched and have not settled yet, by id. When the shutdown timeout passes,
 * the worker fails each of them and sets `abandoned`, so a handler that settles later leaves its
 * job alone: pg-boss retries it by its policy, and handlers are idempotent (module contract).
 */
type Claims = {
  abandoned: boolean;
  readonly held: Map<string, string>;
};

export type WorkerOptions = {
  /** The environment the tenant context is built from, validated before anything connects. */
  readonly source: EnvironmentSource;
  /** The compiled module list. The context and the migrator run take their ids from it (D-12). */
  readonly modules: readonly Module[];
  /** The module histories only; core's history is prepended by the run (R-25). */
  readonly histories: readonly MigrationHistory[];
  readonly output: (line: string) => void;
  readonly errorOutput: (line: string) => void;
  /** Aborting it stops every queue loop; the run then stops pg-boss and closes the pool. */
  readonly signal: AbortSignal;
  /**
   * How long the worker waits, after the signal aborts, for running handlers to settle. After it,
   * the worker stops pg-boss and returns even if a handler never resolves.
   */
  readonly shutdownTimeoutMs?: number;
  /**
   * Test seams for the heartbeat. `path` wins over `WORKER_HEARTBEAT_PATH`. `staleAfterMs` is the
   * age the container health check refuses; the worker itself only writes the file.
   */
  readonly heartbeat?: {
    readonly cron?: string;
    readonly path?: string;
    readonly staleAfterMs?: number;
  };
  /**
   * pg-boss's cron pass and send-it poll intervals. Production passes none and keeps pg-boss's
   * defaults; a test passes faster ones to see a schedule tick within seconds.
   */
  readonly timing?: CronTiming;
};

/** One queue the worker drains: its name, whether it may run now, and what runs a job. */
type QueueLoop = {
  readonly name: string;
  readonly mayRun: () => Promise<boolean>;
  readonly run: (data: JobData) => Promise<void>;
};

function safe(text: string): string {
  // SAFETY: a string in is a string out; the union return is `redact`'s json surface.
  return redact(text) as string;
}

/** The redacted cause chain of whatever a `catch` caught. */
function describe(error: Error | undefined): string {
  return safe(causeChain(error));
}

/**
 * Drains one queue until the signal aborts. The entitlement check runs before `fetch`, so a job
 * of a disabled module stays `created` instead of being claimed and failed (D-11). A failed fetch
 * or handler is reported and the loop goes on, so one bad job or one database blip never stops
 * the worker.
 */
/* oxlint-disable no-await-in-loop -- one queue is drained one job at a time. */
async function drain(
  boss: PgBoss,
  loop: QueueLoop,
  claims: Claims,
  logger: Pick<RedactingLogger, "warn">,
  options: WorkerOptions
): Promise<void> {
  while (!options.signal.aborted) {
    let job: { id: string; data: JobData } | undefined;

    try {
      if (await loop.mayRun()) [job] = await boss.fetch<JobData>(loop.name);

      if (job !== undefined) {
        claims.held.set(job.id, loop.name);
        await loop.run(job.data).finally(() => dropIfAbandoned());
        claims.held.delete(job.id);
        await boss.complete(loop.name, job.id);
        continue;
      }
    } catch (caught) {
      if (caught === ABANDONED) return;

      if (job !== undefined) claims.held.delete(job.id);

      options.errorOutput(
        `worker: ${loop.name}: ${describe(caught instanceof Error ? caught : undefined)}`
      );

      if (job !== undefined) {
        await boss
          .fail(loop.name, job.id, {
            message: describe(caught instanceof Error ? caught : undefined),
          })
          .catch(() => undefined);
      }
    }

    await sleep(POLL_INTERVAL_MS, undefined, { signal: options.signal }).catch(
      () => undefined
    );
  }

  /** Past the shutdown timeout the job is already failed, so a late result is dropped. */
  function dropIfAbandoned(): void {
    if (!claims.abandoned) return;

    logger.warn(
      { queue: loop.name },
      "a job handler settled after the shutdown timeout; its result is dropped"
    );

    throw ABANDONED;
  }
}
/* oxlint-enable no-await-in-loop */

/**
 * Drains one durable event queue with handlers in flight, unlike `drain`, because a serialized
 * queue's contract is one job per key at a time while different keys run in parallel (R-56): the
 * fetch itself refuses the key of a job that is active, in retry or failed, so the loop keeps
 * fetching while an earlier handler is still running. The entitlement check runs before `fetch`,
 * as with jobs. A cap on in-flight handlers bounds a durable queue's backlog.
 */
/* oxlint-disable no-await-in-loop -- one queue, many concurrent keys. */
async function drainEvents(
  boss: PgBoss,
  loop: QueueLoop,
  claims: Claims,
  options: WorkerOptions
): Promise<void> {
  const inFlight = new Map<string, Promise<void>>();

  while (!options.signal.aborted) {
    let fetched = false;

    try {
      if (
        inFlight.size < MAX_EVENT_HANDLERS_IN_FLIGHT &&
        (await loop.mayRun())
      ) {
        const [job] = await boss.fetch<JobData>(loop.name);

        if (job !== undefined) {
          fetched = true;
          claims.held.set(job.id, loop.name);
          inFlight.set(
            job.id,
            (async () => {
              try {
                await loop.run(job.data);
                await boss.complete(loop.name, job.id);
              } catch (caught) {
                if (caught !== ABANDONED) {
                  options.errorOutput(
                    `worker: ${loop.name}: ${describe(
                      caught instanceof Error ? caught : undefined
                    )}`
                  );
                }

                await boss
                  .fail(loop.name, job.id, {
                    message: describe(
                      caught instanceof Error ? caught : undefined
                    ),
                  })
                  .catch(() => undefined);
              } finally {
                claims.held.delete(job.id);
                inFlight.delete(job.id);
              }
            })()
          );
        }
      }
    } catch (caught) {
      if (caught === ABANDONED) break;

      options.errorOutput(
        `worker: ${loop.name}: ${describe(caught instanceof Error ? caught : undefined)}`
      );
    }

    if (fetched) continue;

    // Nothing fetched: wait for a handler to settle or the poll interval to pass, then look again.
    await Promise.race([
      Promise.allSettled(inFlight.values()).then(() => undefined),
      sleep(POLL_INTERVAL_MS, undefined, { signal: options.signal }).catch(
        () => undefined
      ),
    ]);
  }

  // The signal aborted: let the handlers already running settle, like `drain` does, so a graceful
  // stop completes them; the shutdown timeout and `failAbandoned` cover the ones that never do.
  await Promise.allSettled(inFlight.values());
}
/* oxlint-enable no-await-in-loop */

/**
 * Watches one serialized queue's dead-letter queue and reports each arrival at error level with
 * the queue's blocked keys (R-56, R-57): a job that exhausted its retries holds its key until an
 * operator retries or deletes it, and this line is what tells the operator which keys those are.
 * The jobs stay in the dead-letter queue for that recovery; this watch never consumes them.
 */
/* oxlint-disable no-await-in-loop -- a watch polls until the signal aborts. */
async function watchDeadLetter(
  boss: PgBoss,
  subscription: DurableEventQueue & { readonly deadLetter: string },
  options: WorkerOptions
): Promise<void> {
  let reported: number | undefined;

  while (!options.signal.aborted) {
    try {
      const deadLetter = await boss.getQueue(subscription.deadLetter);
      const count = deadLetter?.totalCount ?? 0;

      // The first poll only takes the baseline: moves that happened before this run are the
      // runbook's to find, and the log names what this run watched arrive.
      if (reported === undefined || count > reported) {
        if (reported !== undefined) {
          // SAFETY: an empty list is the answer when the queue cannot be asked, so the line is
          // still written with the dead-letter move it accompanies.
          const blocked = await boss
            .getBlockedKeys(subscription.queue)
            .catch(() => [] as string[]);

          options.errorOutput(
            `worker: ${subscription.queue}: a serialized job exhausted its retries and was moved to the dead-letter queue "${subscription.deadLetter}"; blocked keys: ${
              blocked.join(", ") || "none"
            }`
          );
        }

        reported = count;
      }
    } catch (caught) {
      options.errorOutput(
        `worker: ${subscription.queue}: ${describe(
          caught instanceof Error ? caught : undefined
        )}`
      );
    }

    await sleep(POLL_INTERVAL_MS, undefined, { signal: options.signal }).catch(
      () => undefined
    );
  }
}
/* oxlint-enable no-await-in-loop */

/**
 * Schedules the declared schedule of every enabled module and removes it for every other one, so
 * a disabled or unseeded module adds no schedule row, and a module enabled later is scheduled on
 * the next heartbeat (R-5, DEC-50).
 */
async function reconcileSchedules(
  boss: PgBoss,
  context: TenantContext,
  jobs: readonly { moduleId: string; job: JobDeclaration }[]
): Promise<void> {
  await Promise.all(
    jobs.map(async ({ moduleId, job }) => {
      if (job.schedule === undefined) return;

      if (await context.entitlements.isEnabled(moduleId)) {
        await boss.schedule(job.name, job.schedule, null, {
          key: declarationKey(job),
        });
      } else {
        await boss.unschedule(job.name, declarationKey(job));
      }
    })
  );
}

/**
 * The worker process (R-4, R-50 to R-52). It builds one tenant context from the compiled module
 * list, runs the same migrator run as the application under the same advisory lock, and starts
 * pg-boss only after that run returns, so no job is dequeued before the omission check and the
 * registration commit (R-27, D-11). It then drains every declared job queue and the core
 * heartbeat queue until the signal aborts. Every handler gets the one context (DEC-34).
 *
 * The heartbeat job runs every minute, plus once at start. Its handler makes a database round
 * trip, writes the heartbeat file, and reconciles module schedules, so a fresh file proves that
 * the schedule, the fetch, the handler and the database all work (D-10).
 *
 * Answers the process exit code: 0 after the signal aborts, 1 when the start fails.
 */
export async function runWorker(options: WorkerOptions): Promise<number> {
  const compiledModuleIds = options.modules.map(({ identity }) => identity.id);
  let context: TenantContext;
  let logger: ReturnType<typeof createLogger>;

  try {
    logger = createLogger(validateEnvironment(options.source));
    context = createTenantContext(options.source, logger, compiledModuleIds);
  } catch (caught) {
    options.errorOutput(
      `worker: ${describe(caught instanceof Error ? caught : undefined)}`
    );

    return 1;
  }

  const boss = createBoss(context.db.$client, logger, true, options.timing);

  // The worker serves the same runtime surface the application registered: the durable
  // subscriptions this run drains are the queues an emitting process sends to.
  registerModuleRuntime(context, options.modules);

  try {
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan(options.histories),
      compiledModuleIds,
      log: (event) =>
        options.output(
          safe(
            [event.event, event.history, event.count]
              .filter((part) => part !== undefined)
              .join(" ")
          )
        ),
    });

    if (!options.signal.aborted) await serve(boss, context, logger, options);

    return 0;
  } catch (caught) {
    options.errorOutput(
      `worker: ${describe(caught instanceof Error ? caught : undefined)}`
    );

    return 1;
  } finally {
    await boss.stop({ graceful: false });
    await stopJobQueue(context.jobQueue);
    await context.db.$client.end();
  }
}

/**
 * Starts pg-boss once the migrator run returned, creates every queue, schedules the heartbeat and
 * sends the first one, then drains the heartbeat queue and each module job queue until the signal
 * aborts.
 */
async function serve(
  boss: PgBoss,
  context: TenantContext,
  logger: ReturnType<typeof createLogger>,
  options: WorkerOptions
): Promise<void> {
  const jobs = options.modules.flatMap((module) =>
    module.jobs.map((job) => ({ moduleId: module.identity.id, job }))
  );

  const subscriptions = durableEventQueues(context.events);

  await boss.start();

  await Promise.all([
    ...[HEARTBEAT_JOB, ...jobs.map(({ job }) => job.name)].map(async (name) =>
      boss.createQueue(name)
    ),
    // A dead-letter queue exists before the serialized queue that names it references it (R-57),
    // and each serialized queue keeps its key_strict_fifo policy across restarts.
    ...subscriptions.map(async (subscription) => {
      if (subscription.deadLetter !== undefined) {
        await boss.createQueue(subscription.deadLetter);
        await boss.createQueue(subscription.queue, {
          policy: "key_strict_fifo",
          deadLetter: subscription.deadLetter,
        });
      } else {
        await boss.createQueue(subscription.queue);
      }
    }),
  ]);
  await boss.schedule(HEARTBEAT_JOB, options.heartbeat?.cron ?? HEARTBEAT_CRON);
  await boss.send(HEARTBEAT_JOB, {});

  const jobLoops = [
    heartbeatLoop(boss, context, jobs, options),
    ...jobs.map(({ moduleId, job }): QueueLoop => ({
      name: job.name,
      mayRun: async () => context.entitlements.isEnabled(moduleId),
      // SAFETY: a queue carries only the data its own module enqueued under this job name.
      run: async (data) => job.handler({ tenant: context }, data as never),
    })),
  ];

  // A durable event handler runs under its owning module's entitlement, like a declared job; a
  // direct `on` registration owns no module, so its queue is core's and never entitled.
  // SAFETY: an event queue carries only the envelopes its own subscription enqueued.
  const eventLoops = subscriptions.map((subscription): QueueLoop => ({
    name: subscription.queue,
    mayRun: async () =>
      subscription.ownerModuleId === undefined ||
      context.entitlements.isEnabled(subscription.ownerModuleId),
    run: async (data) => subscription.handler(data as never, context),
  }));

  options.output("worker started");

  const limit = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const drained = new AbortController();
  const claims: Claims = { abandoned: false, held: new Map() };

  const settled = await Promise.race([
    Promise.all([
      // Job queues and the heartbeat run one job at a time; event queues run handlers
      // concurrently, because serialized keys are parallel across keys (R-56).
      ...jobLoops.map(async (loop) =>
        drain(boss, loop, claims, logger, options)
      ),
      ...eventLoops.map(async (loop) =>
        drainEvents(boss, loop, claims, options)
      ),
      ...subscriptions
        .filter(
          (
            subscription
          ): subscription is DurableEventQueue & {
            readonly deadLetter: string;
          } => subscription.deadLetter !== undefined
        )
        .map((subscription) => watchDeadLetter(boss, subscription, options)),
    ]).then(() => true),
    elapsedAfterAbort(options.signal, limit, drained.signal),
  ]);

  drained.abort();

  if (!settled) {
    logger.error(
      { shutdownTimeoutMs: limit, jobs: claims.held.size },
      "a job handler did not settle before the shutdown timeout; failing its job and stopping pg-boss"
    );
    await failAbandoned(boss, claims, logger);
  }
}

/**
 * Marks every still-fetched job failed before pg-boss stops and the pool closes, so pg-boss
 * retries it by its policy instead of leaving it active until expiry. A failed `fail` is logged;
 * that job then expires and retries the same way.
 */
async function failAbandoned(
  boss: PgBoss,
  claims: Claims,
  logger: Pick<RedactingLogger, "error">
): Promise<void> {
  claims.abandoned = true;

  await Promise.all(
    [...claims.held].map(async ([id, queue]) =>
      boss
        .fail(queue, id, {
          message: "the worker shut down before the handler settled",
        })
        .catch((error: Error) =>
          logger.error({ err: error, queue }, "could not fail an abandoned job")
        )
    )
  );

  claims.held.clear();
}

/**
 * Answers false `ms` after `signal` aborts. `cancel` ends the wait early once the loops settled,
 * so no timer outlives the run.
 */
async function elapsedAfterAbort(
  signal: AbortSignal,
  ms: number,
  cancel: AbortSignal
): Promise<false> {
  try {
    if (!signal.aborted) await once(signal, "abort", { signal: cancel });

    await sleep(ms, undefined, { signal: cancel });
  } catch {
    // Cancelled because the loops settled first; the race already has its answer.
  }

  return false;
}

/**
 * The core heartbeat queue: no entitlement gate, a round trip, the schedules, then the file. The
 * file is written last, so a reconciliation that keeps failing lets the health check go stale.
 */
function heartbeatLoop(
  boss: PgBoss,
  context: TenantContext,
  jobs: readonly { moduleId: string; job: JobDeclaration }[],
  options: WorkerOptions
): QueueLoop {
  const path =
    options.heartbeat?.path ??
    (options.source.WORKER_HEARTBEAT_PATH || DEFAULT_WORKER_HEARTBEAT_PATH);

  return {
    name: HEARTBEAT_JOB,
    mayRun: async () => true,
    run: async () => {
      await context.db.$client.query("select 1");
      await reconcileSchedules(boss, context, jobs);
      await writeFile(path, new Date().toISOString());
    },
  };
}

import type { Pool } from "pg";
import {
  type ConstructorOptions,
  PgBoss,
  type ScheduleOptions,
  type SendOptions,
} from "pg-boss";

import type { RedactingLogger } from "../logging/index.ts";

/** The schema pg-boss creates and migrates at its own start, beside the core tables. */
export const JOB_QUEUE_SCHEMA = "pgboss";

/** Schedule keys under this prefix belong to module job declarations; the worker owns them. */
export const DECLARATION_SCHEDULE_KEY_PREFIX = "genie.module.";

/** One JSON value inside a job payload. */
export type JobValue =
  | string
  | number
  | boolean
  | null
  | readonly JobValue[]
  | { readonly [name: string]: JobValue };

/** A job's payload: the JSON object pg-boss stores beside the job. */
export type JobData = { readonly [name: string]: JobValue };

/**
 * The job queue a procedure, a page or a job reaches through the tenant context. A job name is
 * `<moduleId>.<name>`. The queue is created on first use, so a caller never runs pg-boss's
 * `createQueue` itself.
 */
export type JobQueue = {
  readonly enqueue: (
    job: string,
    data: JobData,
    options?: SendOptions
  ) => Promise<string | null>;
  readonly schedule: (
    job: string,
    cron: string,
    data?: JobData,
    options?: ScheduleOptions
  ) => Promise<void>;
};

/**
 * The cron pass and send-it poll intervals. Production passes none and gets pg-boss's defaults
 * (30 s and 5 s), well inside the 180 s heartbeat staleness; a test injects faster values.
 */
export type CronTiming = Pick<
  ConstructorOptions,
  "cronMonitorIntervalSeconds" | "cronWorkerIntervalSeconds"
>;

/**
 * The constructor options of one pg-boss instance over the context pool (D-11). Its `db` adapter
 * sends every statement through `pool.query`, so pg-boss opens no connection of its own, and
 * `useListenNotify` stays off because that connection would sit outside the pool. `worker` turns
 * supervision and scheduling on; every other instance leaves both off, so only the worker runs
 * maintenance and cron passes.
 */
export function bossOptions(
  pool: Pick<Pool, "query">,
  worker: boolean,
  timing: CronTiming = {}
): ConstructorOptions {
  return {
    db: { executeSql: async (text, values) => pool.query(text, values) },
    schema: JOB_QUEUE_SCHEMA,
    useListenNotify: false,
    supervise: worker,
    schedule: worker,
    ...timing,
  };
}

/** One pg-boss instance built from `bossOptions`, with its error events logged. */
export function createBoss(
  pool: Pick<Pool, "query">,
  logger: Pick<RedactingLogger, "error">,
  worker: boolean,
  timing?: CronTiming
): PgBoss {
  const boss = new PgBoss(bossOptions(pool, worker, timing));

  // An emitter with no `error` listener throws, and pg-boss emits from its own timers, where
  // nothing awaits the call. The listener keeps a database blip from ending the process.
  boss.on("error", (error) => logger.error({ err: error }, "job queue error"));

  return boss;
}

/** Stops the context's lazy pg-boss instance, if it ever started. Off the public type. */
const stoppers = new WeakMap<JobQueue, () => Promise<void>>();

/** The context's lazy pg-boss start, held once per queue so a core service shares the instance. */
const starts = new WeakMap<JobQueue, () => Promise<PgBoss>>();

/**
 * The context's started pg-boss instance, for a core service that manages queues of its own over
 * the same pool — the event bus. Starting works exactly like an `enqueue`: the instance starts on
 * the first call and one start is shared, so no second connection opens and no second maintenance
 * pass runs.
 */
export async function bossOf(queue: JobQueue): Promise<PgBoss> {
  const start = starts.get(queue);

  if (start === undefined) {
    throw new Error("This job queue was not built by createJobQueue.");
  }

  return start();
}

/**
 * The context's job queue. The pg-boss instance starts on the first call, never here, so building
 * a context opens no connection (R-19). The application bootstrap and the worker run the migrator
 * before anything can enqueue, which keeps `boss.start()` after the migrator run (D-11).
 */
export function createJobQueue(
  pool: Pick<Pool, "query">,
  logger: Pick<RedactingLogger, "error">
): JobQueue {
  const boss = createBoss(pool, logger, false);
  let started: Promise<PgBoss> | undefined;

  async function instance(): Promise<PgBoss> {
    // One start in flight at a time, but a failed start is forgotten, so the next call retries it
    // once the database is back instead of rejecting for the life of the process.
    started ??= boss.start().catch((error: Error) => {
      started = undefined;

      throw error;
    });

    return started;
  }

  async function ready(job: string): Promise<PgBoss> {
    const running = await instance();

    await running.createQueue(job);

    return running;
  }

  const queue: JobQueue = {
    enqueue: async (job, data, options) =>
      (await ready(job)).send(job, data, options),
    schedule: async (job, cron, data, options) => {
      // The worker owns these keys for module declarations and rewrites or removes them every
      // heartbeat, so a caller schedule under one would be overwritten or deleted.
      if (options?.key?.startsWith(DECLARATION_SCHEDULE_KEY_PREFIX) === true) {
        throw new Error(
          `Schedule key "${options.key}" is reserved: the "${DECLARATION_SCHEDULE_KEY_PREFIX}" prefix belongs to module job declarations.`
        );
      }

      await (await ready(job)).schedule(job, cron, data, options);
    },
  };

  stoppers.set(queue, async () => {
    if (started !== undefined) await boss.stop({ graceful: false });
  });

  starts.set(queue, instance);

  return queue;
}

/** Stops a queue this module built. The process owner calls it once, before it ends the pool. */
export async function stopJobQueue(queue: JobQueue): Promise<void> {
  await stoppers.get(queue)?.();
}

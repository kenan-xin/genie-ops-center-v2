import type { Pool } from "pg";
import { PgBoss, type ScheduleOptions, type SendOptions } from "pg-boss";

import type { RedactingLogger } from "../logging/index.ts";

/** The schema pg-boss creates and migrates at its own start, beside the core tables. */
export const JOB_QUEUE_SCHEMA = "pgboss";

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
 * One pg-boss instance over the context pool (D-11). Its `db` adapter sends every statement
 * through `pool.query`, so pg-boss opens no connection of its own, and `useListenNotify` stays
 * off because that connection would sit outside the pool. `worker` turns supervision and
 * scheduling on; every other instance leaves both off, so only the worker runs maintenance and
 * cron passes.
 */
export function createBoss(
  pool: Pick<Pool, "query">,
  logger: Pick<RedactingLogger, "error">,
  worker: boolean
): PgBoss {
  const boss = new PgBoss({
    db: { executeSql: async (text, values) => pool.query(text, values) },
    schema: JOB_QUEUE_SCHEMA,
    useListenNotify: false,
    supervise: worker,
    schedule: worker,
  });

  // An emitter with no `error` listener throws, and pg-boss emits from its own timers, where
  // nothing awaits the call. The listener keeps a database blip from ending the process.
  boss.on("error", (error) => logger.error({ err: error }, "job queue error"));

  return boss;
}

/** Stops the context's lazy pg-boss instance, if it ever started. Off the public type. */
const stoppers = new WeakMap<JobQueue, () => Promise<void>>();

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

  async function ready(job: string): Promise<PgBoss> {
    started ??= boss.start();

    const instance = await started;

    await instance.createQueue(job);

    return instance;
  }

  const queue: JobQueue = {
    enqueue: async (job, data, options) =>
      (await ready(job)).send(job, data, options),
    schedule: async (job, cron, data, options) =>
      (await ready(job)).schedule(job, cron, data, options),
  };

  stoppers.set(queue, async () => {
    if (started !== undefined) await boss.stop({ graceful: false });
  });

  return queue;
}

/** Stops a queue this module built. The process owner calls it once, before it ends the pool. */
export async function stopJobQueue(queue: JobQueue): Promise<void> {
  await stoppers.get(queue)?.();
}

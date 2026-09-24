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
import {
  createTenantContext,
  type TenantContext,
} from "../../lib/tenant-context/index.ts";
import { causeChain } from "../../utils/error-cause.ts";
import { createBoss, type JobData, stopJobQueue } from "../job-queue/index.ts";
import { createLogger, redact } from "../logging/index.ts";
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

/** How long a queue loop waits after it finds no job, or finds its module disabled. */
const POLL_INTERVAL_MS = 1000;

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
   * Test seams for the heartbeat. `path` wins over `WORKER_HEARTBEAT_PATH`. `staleAfterMs` is the
   * age the container health check refuses; the worker itself only writes the file.
   */
  readonly heartbeat?: {
    readonly cron?: string;
    readonly path?: string;
    readonly staleAfterMs?: number;
  };
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
  options: WorkerOptions
): Promise<void> {
  while (!options.signal.aborted) {
    let job: { id: string; data: JobData } | undefined;

    try {
      if (await loop.mayRun()) [job] = await boss.fetch<JobData>(loop.name);

      if (job !== undefined) {
        await loop.run(job.data);
        await boss.complete(loop.name, job.id);
        continue;
      }
    } catch (caught) {
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
        await boss.schedule(job.name, job.schedule);
      } else {
        await boss.unschedule(job.name);
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

  const boss = createBoss(context.db.$client, logger, true);

  const heartbeatPath =
    options.heartbeat?.path ??
    (options.source.WORKER_HEARTBEAT_PATH || DEFAULT_WORKER_HEARTBEAT_PATH);

  const jobs = options.modules.flatMap((module) =>
    module.jobs.map((job) => ({ moduleId: module.identity.id, job }))
  );

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

    if (options.signal.aborted) return 0;

    await boss.start();
    await Promise.all(
      [HEARTBEAT_JOB, ...jobs.map(({ job }) => job.name)].map(async (name) =>
        boss.createQueue(name)
      )
    );
    await boss.schedule(
      HEARTBEAT_JOB,
      options.heartbeat?.cron ?? HEARTBEAT_CRON
    );
    await boss.send(HEARTBEAT_JOB, {});

    const heartbeat: QueueLoop = {
      name: HEARTBEAT_JOB,
      mayRun: async () => true,
      run: async () => {
        await context.db.$client.query("select 1");
        await writeFile(heartbeatPath, new Date().toISOString());
        await reconcileSchedules(boss, context, jobs);
      },
    };

    const moduleLoops = jobs.map(({ moduleId, job }): QueueLoop => ({
      name: job.name,
      mayRun: async () => context.entitlements.isEnabled(moduleId),
      // SAFETY: a queue carries only the data its own module enqueued under this job name.
      run: async (data) => job.handler({ tenant: context }, data as never),
    }));

    options.output("worker started");
    await Promise.all(
      [heartbeat, ...moduleLoops].map(async (loop) =>
        drain(boss, loop, options)
      )
    );

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

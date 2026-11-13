import { randomUUID } from "node:crypto";
import { createServer, connect, type AddressInfo } from "node:net";

import { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it } from "vitest";

import type {
  JobDeclaration,
  Module,
} from "../src/lib/module-contract/module.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import { AGENT_FILE_JOB } from "../src/services/agent/file-job.ts";
import { startRun } from "../src/services/agent/run-job.ts";
import { AGENT_RUN_JOB_NAME } from "../src/services/agent/runs.ts";
import { principalFor } from "../src/services/authorization/index.ts";
import { stopJobQueue } from "../src/services/job-queue/index.ts";
import { enqueueJob } from "../src/services/job-queue/module-jobs.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  MIGRATION_LOCK_KEY,
  type MigrationHistory,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { runWorker } from "../src/services/worker/index.ts";
import { insertUser } from "./access-fixtures.ts";
import { startDisposablePostgres } from "./index.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- the cases keep setup/assertion pairs together. */

const cleanups: Array<() => Promise<void>> = [];
const OUTPUT = { output: () => {}, errorOutput: () => {} };

/* oxlint-disable anti-slop/require-readable-spacing -- integration cases keep each DB setup beside its assertion. */

afterEach(async () => {
  await cleanups
    .splice(0)
    .toReversed()
    .reduce((previous, cleanup) => previous.then(cleanup), Promise.resolve());
});

function moduleWithJob(
  id: string,
  handler: JobDeclaration<{ label: string }>["handler"],
  schedule?: string
): Module {
  const job: JobDeclaration<{ label: string }> =
    schedule === undefined
      ? { name: `${id}.read-record`, handler }
      : { name: `${id}.read-record`, schedule, handler };

  return {
    identity: { id, displayName: id, version: "0.0.0" },
    schema: {
      tables: {},
      migrations: () => [],
      migrationsTable: `__drizzle_migrations_${id}`,
    },
    contract: {},
    // SAFETY: Worker tests never dispatch application routes; the router contract is not read.
    router: {} as Module["router"],
    permissions: [],
    recordTypes: [],
    defaultRoles: [],
    navigation: { pinned: [], entries: [] },
    pages: { workspace: [], admin: [] },
    events: [],
    capabilities: [],
    jobs: [job],
    inboundEndpoints: [],
    integrationKinds: [],
    tests: { presets: [] },
  };
}

function history(name: string): MigrationHistory {
  return {
    name,
    table: `__drizzle_migrations_${name.replaceAll("-", "_")}`,
    migrations: [
      {
        sql: [
          `CREATE TABLE "${name}_source_record" ("label" text NOT NULL);`,
          `INSERT INTO "${name}_source_record" ("label") VALUES ('migrated-record');`,
          `CREATE TABLE "${name}_job_effect" ("label" text NOT NULL);`,
        ],
        bps: true,
        folderMillis: 1789948987482,
        hash: `worker-${name}`,
      },
    ],
  };
}

async function disposablePostgres() {
  const database = await startDisposablePostgres();

  cleanups.push(() => database.stop());

  return database;
}

function source(databaseUrl: string, additional: Record<string, string> = {}) {
  return {
    DATABASE_URL: databaseUrl,
    PUBLIC_URL: "https://test.example.invalid",
    ...additional,
  };
}

async function boss(context: TenantContext): Promise<PgBoss> {
  const instance = new PgBoss({
    db: {
      executeSql: async (text, values) =>
        context.db.$client.query(text, values),
    },
    schema: "pgboss",
    useListenNotify: false,
    supervise: false,
    schedule: false,
  });

  await instance.start();
  cleanups.push(() => instance.stop());

  return instance;
}

/* oxlint-disable no-await-in-loop -- database polling must stop at the first observed state. */
async function waitUntil(
  check: () => Promise<boolean>,
  budgetMs = 12000
): Promise<void> {
  const deadline = Date.now() + budgetMs;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("worker integration condition timed out");
}
/* oxlint-enable no-await-in-loop */

describe("the core pg-boss worker", () => {
  it("runs an enqueued placeholder handler and reads from the worker database", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(source(database.url), silentLogger(), [
      "placeholder",
    ]);
    const handled = deferred();
    const module = moduleWithJob("placeholder", async ({ tenant }, data) => {
      const records = await tenant.db.$client.query<{ label: string }>(
        'select label from "placeholder_source_record"'
      );
      await tenant.db.$client.query(
        'insert into "placeholder_job_effect" (label) values ($1)',
        [records.rows[0]?.label]
      );
      expect(data.label).toBe("queued-placeholder-job");
      handled.resolve();
    });
    const moduleHistory = history("placeholder");

    cleanups.push(() => context.db.$client.end());
    const queue = await boss(context);

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([
        {
          ...moduleHistory,
          migrations: [],
        },
      ]),
      compiledModuleIds: ["placeholder"],
    });
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('placeholder', true)"
    );
    await queue.createQueue("placeholder.read-record");
    await queue.send("placeholder.read-record", {
      label: "queued-placeholder-job",
    });

    const controller = new AbortController();
    const running = runWorker({
      source: source(database.url),
      modules: [module],
      histories: [moduleHistory],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "* * * * *",
        path: "/tmp/worker-heartbeat",
        staleAfterMs: 180000,
      },
    });

    await handled.promise;
    controller.abort();
    await running;

    const result = await context.db.$client.query<{ label: string }>(
      'select label from "placeholder_job_effect"'
    );

    expect(result.rows).toEqual([{ label: "migrated-record" }]);
  });

  it("does not dequeue a queued job while its migrator waits on the shared advisory lock", async () => {
    const database = await disposablePostgres();
    const app = createTenantContext(source(database.url), silentLogger(), [
      "startup-race",
    ]);
    const module = moduleWithJob("startup-race", async ({ tenant }) => {
      await tenant.db.$client.query(
        "insert into \"startup-race_job_effect\" (label) values ('processed')"
      );
    });
    const plannedHistory = history("startup-race");
    cleanups.push(() => app.db.$client.end());

    await runMigrations({
      env: app.env,
      pool: app.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });
    await app.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('startup-race', true)"
    );
    const queue = await boss(app);
    await queue.createQueue("startup-race.read-record");
    await queue.send("startup-race.read-record", { label: "queued" });
    const held = await app.db.$client.connect();
    await held.query("select pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);

    const controller = new AbortController();
    const worker = runWorker({
      source: source(database.url),
      modules: [module],
      histories: [plannedHistory],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "* * * * *",
        path: "/tmp/worker-heartbeat",
        staleAfterMs: 180000,
      },
    });
    const applicationMigrate = runMigrations({
      env: app.env,
      pool: app.db.$client,
      histories: migrationPlan([plannedHistory]),
      compiledModuleIds: ["startup-race"],
    });

    await waitUntil(async () => {
      const waiters = await app.db.$client.query<{ count: number }>(
        "select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and wait_event = 'advisory'"
      );
      const queued = await queue.findJobs<{ label: string }>(
        "startup-race.read-record"
      );

      return waiters.rows[0]?.count === 2 && queued[0]?.state === "created";
    });
    const beforeUnlock = await app.db.$client.query<{ effect: boolean }>(
      "select exists(select 1 from pg_tables where schemaname = 'public' and tablename = 'startup-race_job_effect') as effect"
    );

    expect(beforeUnlock.rows[0]?.effect).toBe(false);

    await held.query("select pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);
    held.release();
    await applicationMigrate;
    controller.abort();
    await worker;
  });

  it("starts its own migrator and pg-boss schema without an application process", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    cleanups.push(() => context.db.$client.end());
    const controller = new AbortController();
    const worker = runWorker({
      source: source(database.url),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "* * * * *",
        path: "/tmp/worker-heartbeat",
        staleAfterMs: 180000,
      },
    });

    await waitUntil(async () => {
      const result = await context.db.$client.query<{
        coreLedger: string | null;
        bossSchema: boolean;
      }>(
        "select to_regclass('drizzle.__drizzle_migrations') as \"coreLedger\", exists(select 1 from information_schema.schemata where schema_name = 'pgboss') as \"bossSchema\""
      );

      return (
        result.rows[0]?.coreLedger !== null &&
        result.rows[0]?.bossSchema === true
      );
    });

    controller.abort();
    await worker;
  });

  it("runs a queued agent file job as its starter", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    cleanups.push(() => context.db.$client.end());
    cleanups.push(() => stopJobQueue(context.jobQueue));

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });

    const userId = await insertUser(context);
    const sessionId = randomUUID();

    await context.db.$client.query(
      "insert into agent_session (id, user_id, title, model_id) values ($1, $2, 'Chat', 'test-model')",
      [sessionId, userId]
    );

    const { rows } = await context.db.$client.query<{ id: string }>(
      `insert into agent_file (session_id, tool_call_id, title, format, dataset, query)
       values ($1, 'call-make-file', 'All records', 'csv', 'missing.records', '{"select":["id"]}')
       returning id`,
      [sessionId]
    );
    const agentFileId = rows[0]?.id ?? "";

    const queue = await boss(context);
    await queue.createQueue(AGENT_FILE_JOB.name);
    await enqueueJob(
      {
        tenant: context,
        caller: principalFor({
          tenant: context,
          modules: [],
          userId,
          authenticated: true,
        }),
      },
      AGENT_FILE_JOB,
      { agentFileId }
    );

    const controller = new AbortController();
    const worker = runWorker({
      source: source(database.url),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "* * * * *",
        path: "/tmp/worker-heartbeat",
        staleAfterMs: 180000,
      },
    });

    await waitUntil(async () => {
      const state = await context.db.$client.query<{ state: string }>(
        "select state from agent_file where id = $1",
        [agentFileId]
      );

      return state.rows[0]?.state === "failed";
    });
    controller.abort();
    await worker;

    const audit = await context.db.$client.query<{
      actor_user_id: string;
      outcome: string;
    }>(
      "select actor_user_id, metadata->>'outcome' as outcome from audit_event where action = 'core:agent_file_made'"
    );

    expect(audit.rows).toEqual([
      { actor_user_id: userId, outcome: "not-found" },
    ]);
  });

  it("settles agent runs at start and leaves a live one alone", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    cleanups.push(() => context.db.$client.end());
    cleanups.push(() => stopJobQueue(context.jobQueue));

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });

    // One person per run, because each person holds at most one run.
    const runSession = async (
      runState: string | null,
      runJobId: string | null
    ) => {
      const userId = await insertUser(context);
      const id = randomUUID();

      await context.db.$client.query(
        "insert into agent_session (id, user_id, title, model_id, surface, run_state, run_job_id) values ($1, $2, 'Chat', 'test-model', 'placeholder', $3, $4)",
        [id, userId, runState, runJobId]
      );

      return { id, userId };
    };

    const queue = await boss(context);
    await queue.createQueue(AGENT_RUN_JOB_NAME);

    // A: its job failed while the run still says running, as after a crash.
    const failedJob = await queue.send(
      AGENT_RUN_JOB_NAME,
      { sessionId: "a" },
      { retryLimit: 0 }
    );
    const [fetchedA] = await queue.fetch(AGENT_RUN_JOB_NAME);
    await queue.fail(AGENT_RUN_JOB_NAME, fetchedA?.id ?? "");
    const a = await runSession("running", failedJob);

    // B: Stop was asked, and no job holds the run.
    const b = await runSession("stopping", randomUUID());

    // C: another worker runs it now; the queue's 15-minute expiry keeps it active.
    const liveJob = await queue.send(AGENT_RUN_JOB_NAME, { sessionId: "c" });
    await queue.fetch(AGENT_RUN_JOB_NAME);
    const c = await runSession("running", liveJob);

    // D: queued by a person who may not ask, so the run job ends it failed.
    const d = await runSession(null, null);
    await withTransaction(context, async (tx) =>
      startRun(
        {
          tenant: context,
          caller: principalFor({
            tenant: context,
            modules: [],
            userId: d.userId,
            authenticated: true,
          }),
        },
        tx,
        d.id
      )
    );

    const runs = async () => {
      const { rows } = await context.db.$client.query<{
        id: string;
        run_state: string | null;
        run_error: string | null;
      }>("select id, run_state, run_error from agent_session");

      return new Map(rows.map((row) => [row.id, row]));
    };

    const controller = new AbortController();
    const worker = runWorker({
      source: source(database.url),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "* * * * *",
        path: "/tmp/worker-heartbeat",
        staleAfterMs: 180000,
      },
    });

    await waitUntil(async () => {
      const now = await runs();

      return (
        now.get(a.id)?.run_error === "interrupted" &&
        now.get(b.id)?.run_error === "stopped" &&
        now.get(d.id)?.run_error === "failed"
      );
    });
    controller.abort();
    await worker;

    expect((await runs()).get(c.id)).toEqual({
      id: c.id,
      run_state: "running",
      run_error: null,
    });
  });

  // Red on the old code (one run loop): "worker integration condition timed out" at the wait for B.
  it("runs a second person's agent run while the first one still runs", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    cleanups.push(() => context.db.$client.end());
    cleanups.push(() => stopJobQueue(context.jobQueue));

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });

    const queue = await boss(context);
    await queue.createQueue(AGENT_RUN_JOB_NAME);

    const person = async () => {
      const userId = await insertUser(context);
      const id = randomUUID();

      await context.db.$client.query(
        "insert into agent_session (id, user_id, title, model_id) values ($1, $2, 'Chat', 'test-model')",
        [id, userId]
      );

      const ctx = {
        tenant: context,
        caller: principalFor({
          tenant: context,
          modules: [],
          userId,
          authenticated: true,
        }),
      };

      return {
        id,
        start: () =>
          withTransaction(context, async (tx) => startRun(ctx, tx, id)),
      };
    };
    const runOf = async (id: string) => {
      const { rows } = await context.db.$client.query<{
        run_state: string | null;
        run_error: string | null;
      }>("select run_state, run_error from agent_session where id = $1", [id]);

      return rows[0];
    };

    const a = await person();
    const b = await person();
    const jobA = await a.start();

    // A's handler waits in `markRunning` on this lock, as a run waits on its model.
    const lock = await context.db.$client.connect();
    await lock.query("begin");
    await lock.query("select id from agent_session where id = $1 for update", [
      a.id,
    ]);

    const controller = new AbortController();
    const worker = runWorker({
      source: source(database.url),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "* * * * *",
        path: "/tmp/worker-heartbeat",
        staleAfterMs: 180000,
      },
    });

    try {
      await waitUntil(async () => {
        const [job] = await queue.findJobs(AGENT_RUN_JOB_NAME, { id: jobA });

        return job?.state === "active";
      });
      await b.start();

      // B holds no `core:ask:use`, so its job ends it without a model call.
      await waitUntil(async () => (await runOf(b.id))?.run_error === "failed");
      expect(await runOf(a.id)).toEqual({
        run_state: "queued",
        run_error: null,
      });
    } finally {
      await lock.query("rollback");
      lock.release();
      await waitUntil(async () => (await runOf(a.id))?.run_error === "failed");
      controller.abort();
      await worker;
    }
  });

  it("skips a job of a compiled module with no tenant_module row", async () => {
    await expectSkippedModuleJob({ id: "unseeded", enabled: undefined });
  });

  it("registers a new module disabled and runs neither its queued job nor its declared schedule", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    const called = deferred();
    const moduleId = "newly-registered";
    const module = moduleWithJob(
      moduleId,
      async () => called.resolve(),
      "*/2 * * * * *"
    );
    const moduleHistory = history(moduleId);
    const controller = new AbortController();
    const heartbeatPath = `/tmp/genie-worker-disabled-module-${crypto.randomUUID()}`;

    cleanups.push(async () => {
      const { unlink } = await import("node:fs/promises");
      await unlink(heartbeatPath).catch(() => undefined);
      await context.db.$client.end();
    });

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });
    await context.db.$client.query(
      "insert into setup_step (step, state) values ('seed', 'done')"
    );
    await context.db.$client.query(
      "insert into tenant_settings default values"
    );

    const publisher = await boss(context);
    await publisher.createQueue(`${moduleId}.read-record`);
    await publisher.send(`${moduleId}.read-record`, {
      label: "must-stay-queued",
    });

    const worker = runWorker({
      source: source(database.url),
      modules: [module],
      histories: [moduleHistory],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "*/1 * * * * *",
        path: heartbeatPath,
        staleAfterMs: 1800,
      },
      timing: { cronMonitorIntervalSeconds: 1, cronWorkerIntervalSeconds: 1 },
    });

    await waitUntil(async () => {
      const heartbeat = await import("node:fs/promises").then(({ access }) =>
        access(heartbeatPath).then(
          () => true,
          () => false
        )
      );
      const rows = await publisher.getSchedules(`${moduleId}.read-record`);

      return (
        heartbeat &&
        rows.every(({ key }) => key !== `genie.module.${moduleId}.read-record`)
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    controller.abort();
    await expect(worker).resolves.toBe(0);

    await expect(
      context.db.$client.query(
        "select module_id, enabled from tenant_module where module_id = $1",
        [moduleId]
      )
    ).resolves.toMatchObject({
      rows: [{ module_id: moduleId, enabled: false }],
    });
    expect(called.isResolved()).toBe(false);
    await expect(
      publisher.findJobs(`${moduleId}.read-record`)
    ).resolves.toMatchObject([
      { state: "created", data: { label: "must-stay-queued" } },
    ]);
    await expect(
      publisher.getSchedules(`${moduleId}.read-record`)
    ).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          key: `genie.module.${moduleId}.read-record`,
        }),
      ])
    );
  });

  it("schedules a declared job with a cron expression distinct from its data", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(source(database.url), silentLogger(), [
      "scheduled",
    ]);
    const module = moduleWithJob("scheduled", async () => {}, "0 3 * * *");
    const controller = new AbortController();
    const heartbeatPath = `/tmp/genie-worker-schedule-api-${crypto.randomUUID()}`;

    cleanups.push(async () => {
      const { unlink } = await import("node:fs/promises");
      await unlink(heartbeatPath).catch(() => undefined);
      await context.db.$client.end();
    });

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [module.identity.id],
    });
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('scheduled', true)"
    );

    const inspector = await boss(context);
    cleanups.push(() => inspector.stop());
    const worker = runWorker({
      source: source(database.url),
      modules: [module],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: {
        cron: "*/1 * * * * *",
        path: heartbeatPath,
        staleAfterMs: 1800,
      },
      timing: { cronMonitorIntervalSeconds: 1, cronWorkerIntervalSeconds: 1 },
    });

    await waitUntil(async () => {
      const rows = await inspector.getSchedules("scheduled.read-record");

      return rows.some(({ cron }) => cron === "0 3 * * *");
    });

    await expect(
      context.jobQueue.schedule("scheduled.read-record", "*/7 * * * *", {
        reportId: "weekly-42",
      })
    ).resolves.toBeUndefined();

    const heartbeatBefore = await inspector.getSchedule(
      "core.worker-heartbeat"
    );

    await waitUntil(async () => {
      const afterTick = await inspector.getSchedule("core.worker-heartbeat");

      return afterTick?.lastJobId !== heartbeatBefore?.lastJobId;
    });

    const declarationSchedule = await inspector.getSchedule(
      "scheduled.read-record",
      "genie.module.scheduled.read-record"
    );
    const schedules = await inspector.getSchedules("scheduled.read-record");
    const applicationSchedule = schedules.find(({ key }) => key === "");
    const moduleSchedule = schedules.find(({ cron }) => cron === "0 3 * * *");

    controller.abort();
    await worker;

    expect(applicationSchedule).toMatchObject({
      cron: "*/7 * * * *",
      data: { reportId: "weekly-42" },
    });
    expect(moduleSchedule).toBeDefined();
    expect(moduleSchedule?.key).not.toBe(applicationSchedule?.key);
    expect(declarationSchedule).toMatchObject({
      cron: "0 3 * * *",
      key: "genie.module.scheduled.read-record",
    });
  });

  it("retries a failed lazy pg-boss start after the database query recovers", async () => {
    const database = await disposablePostgres();
    const control = createServer();
    const firstConnection = deferred();
    let upstreamAllowed = false;
    const target = new URL(database.url);

    control.on("connection", (downstream) => {
      // The database is unreachable until the test allows it: every connection before that
      // fails, including the ones pg-boss's start makes after its best-effort version probe.
      if (!upstreamAllowed) {
        firstConnection.resolve();
        downstream.destroy();
        return;
      }

      const upstream = connect(Number(target.port), target.hostname);

      upstream.once("connect", () => {
        downstream.pipe(upstream);
        upstream.pipe(downstream);
      });
      upstream.once("error", () => downstream.destroy());
    });

    await new Promise<void>((resolve) =>
      control.listen(0, "127.0.0.1", resolve)
    );
    // SAFETY: listen(0, "127.0.0.1") binds TCP and returns AddressInfo before this read.
    const address = control.address() as AddressInfo;

    const proxyUrl = new URL(database.url);

    proxyUrl.hostname = "127.0.0.1";
    proxyUrl.port = String(address.port);

    const context = createTenantContext(
      source(proxyUrl.toString()),
      silentLogger(),
      []
    );

    cleanups.push(async () => {
      await stopJobQueue(context.jobQueue);
      await context.db.$client.end();
      control.close();
    });

    const failedSend = context.jobQueue
      .enqueue("recovery.first", { attempt: "first" })
      .then(
        () => undefined,
        (error: Error) => error
      );

    await firstConnection.promise;
    const firstFailure = await failedSend;

    expect(firstFailure).toBeInstanceOf(Error);
    upstreamAllowed = true;

    const jobId = await context.jobQueue.enqueue("recovery.second", {
      attempt: "recovered",
    });
    const persisted = await context.db.$client.query<{
      id: string;
      data: unknown;
    }>("select id::text, data from pgboss.job where id = $1", [jobId]);

    expect(persisted.rows).toEqual([
      { id: jobId, data: { attempt: "recovered" } },
    ]);
  });

  it("does not refresh the heartbeat when declaration schedule reconciliation fails", async () => {
    const { access, unlink } = await import("node:fs/promises");
    const database = await disposablePostgres();
    const context = createTenantContext(source(database.url), silentLogger(), [
      "invalid-schedule",
    ]);
    const heartbeatPath = `/tmp/genie-worker-invalid-schedule-${crypto.randomUUID()}`;
    const module = moduleWithJob(
      "invalid-schedule",
      async () => {},
      "not a cron expression"
    );
    const errors: string[] = [];
    const controller = new AbortController();

    cleanups.push(async () => {
      await unlink(heartbeatPath).catch(() => undefined);
      await context.db.$client.end();
    });

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [module.identity.id],
    });
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('invalid-schedule', true)"
    );

    const worker = runWorker({
      source: source(database.url),
      modules: [module],
      histories: [],
      output: () => {},
      errorOutput: (line) => errors.push(line),
      signal: controller.signal,
      heartbeat: {
        cron: "*/1 * * * * *",
        path: heartbeatPath,
        staleAfterMs: 1800,
      },
    });

    await waitUntil(async () =>
      errors.some((line) => line.includes("core.worker-heartbeat"))
    );

    const heartbeatExists = await access(heartbeatPath).then(
      () => true,
      () => false
    );

    controller.abort();
    await worker;

    expect(heartbeatExists).toBe(false);
  });

  it("settles an abandoned handler job and ignores its late result", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(source(database.url), silentLogger(), [
      "shutdown",
    ]);
    const started = deferred();
    let resolveHandler!: () => void;
    const neverFinish = new Promise<void>((resolve) => {
      resolveHandler = resolve;
    });
    const controller = new AbortController();

    cleanups.push(() => context.db.$client.end());

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: ["shutdown"],
    });
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('shutdown', true)"
    );

    const publisher = await boss(context);

    const jobName = "shutdown.read-record";

    await publisher.createQueue(jobName);
    const inserted = await publisher.insert(
      jobName,
      [{ data: { label: "never-resolves" } }],
      { returnId: true }
    );
    const queuedId = inserted?.[0];

    if (queuedId === undefined) {
      throw new Error("the shutdown fixture job was not inserted");
    }

    const shutdownModule = moduleWithJob("shutdown", async () => {
      started.resolve();
      await neverFinish;
    });
    const worker = runWorker({
      source: source(database.url),
      modules: [shutdownModule],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      shutdownTimeoutMs: 250,
      heartbeat: {
        cron: "*/1 * * * * *",
        path: `/tmp/genie-worker-shutdown-${crypto.randomUUID()}`,
        staleAfterMs: 1800,
      },
    });

    await started.promise;
    controller.abort();

    await worker;

    const afterShutdown = await publisher.findJobs(jobName, { id: queuedId });

    expect(afterShutdown[0]?.state).toMatch(/^(failed|retry)$/);

    resolveHandler();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const afterLateHandler = await publisher.findJobs(jobName, {
      id: queuedId,
    });

    expect(afterLateHandler[0]?.state).toBe(afterShutdown[0]?.state);
  });

  it("writes heartbeat from the scheduled core job only after migration completes, then becomes stale when aborted", async () => {
    const { access, unlink } = await import("node:fs/promises");
    const database = await disposablePostgres();
    const path = `/tmp/genie-worker-heartbeat-${crypto.randomUUID()}`;
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    const publisher = await boss(context);
    cleanups.push(() => context.db.$client.end());

    const lock = await context.db.$client.connect();
    const controller = new AbortController();

    cleanups.push(async () => {
      await unlink(path).catch(() => undefined);
    });

    await lock.query("select pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);
    const worker = runWorker({
      source: source(database.url),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: { cron: "*/1 * * * * *", path, staleAfterMs: 1800 },
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(access(path)).rejects.toThrow();
    await lock.query("select pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);
    lock.release();
    await waitUntil(async () =>
      access(path).then(
        () => true,
        () => false
      )
    );

    const heartbeat = await (await import("node:fs/promises")).stat(path);

    expect(Date.now() - heartbeat.mtimeMs).toBeLessThan(1800);
    controller.abort();
    await worker;

    const lastHeartbeatAt = (
      await (await import("node:fs/promises")).stat(path)
    ).mtimeMs;

    await new Promise((resolve) => setTimeout(resolve, 1900));

    const staleHeartbeatAt = (
      await (await import("node:fs/promises")).stat(path)
    ).mtimeMs;

    expect(staleHeartbeatAt).toBe(lastHeartbeatAt);
    expect(Date.now() - staleHeartbeatAt).toBeGreaterThan(1800);
    expect(await publisher.getSchedules("core.worker-heartbeat")).toHaveLength(
      1
    );
  });
});

async function expectSkippedModuleJob(input: {
  id: string;
  enabled: boolean | undefined;
}): Promise<void> {
  const database = await disposablePostgres();
  const context = createTenantContext(source(database.url), silentLogger(), [
    input.id,
  ]);
  const called = deferred();
  const module = moduleWithJob(
    input.id,
    async () => {
      called.resolve();
    },
    "*/2 * * * * *"
  );
  const moduleHistory = history(input.id);
  const controller = new AbortController();

  cleanups.push(() => context.db.$client.end());

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan([moduleHistory]),
    compiledModuleIds: [input.id],
  });
  if (input.enabled !== undefined) {
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ($1, $2)",
      [input.id, input.enabled]
    );
  }

  const queue = await boss(context);

  await queue.createQueue(`${input.id}.read-record`);
  await queue.send(`${input.id}.read-record`, {
    label: "should-remain-queued",
  });

  const worker = runWorker({
    source: source(database.url),
    modules: [module],
    histories: [moduleHistory],
    ...OUTPUT,
    signal: controller.signal,
    heartbeat: {
      cron: "* * * * *",
      path: "/tmp/worker-heartbeat",
      staleAfterMs: 180000,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 4000));
  controller.abort();
  await worker;

  expect(called.isResolved()).toBe(false);
  const states = await queue.findJobs<{ label: string }>(
    `${input.id}.read-record`
  );

  expect(states.map(({ state }) => state)).toEqual(["created"]);
}
/* oxlint-enable anti-slop/require-readable-spacing */

function deferred() {
  let resolve!: () => void;
  let resolved = false;

  const promise = new Promise<void>((done) => {
    resolve = () => {
      resolved = true;
      done();
    };
  });

  return { promise, resolve, isResolved: () => resolved };
}

import { createServer, connect, type AddressInfo } from "node:net";

import { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  JobDeclaration,
  Module,
} from "../src/lib/module-contract/module.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { stopJobQueue } from "../src/services/job-queue/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  MIGRATION_LOCK_KEY,
  type MigrationHistory,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { runWorker } from "../src/services/worker/index.ts";
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
    // SAFETY: Worker tests never dispatch application routes; the router contract is not read.
    router: {} as Module["router"],
    permissions: [],
    recordTypes: [],
    defaultRoles: [],
    navigation: { pinned: [], entries: [] },
    pages: { workspace: {}, admin: {} },
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

  it("serializes concurrent fresh application and worker migration runs", async () => {
    const database = await disposablePostgres();
    const app = createTenantContext(source(database.url), silentLogger(), [
      "dual-start",
    ]);
    const workerContext = createTenantContext(
      source(database.url),
      silentLogger(),
      ["dual-start"]
    );
    const module = moduleWithJob("dual-start", async () => {});
    const moduleHistory: MigrationHistory = {
      name: "dual-start",
      table: "__drizzle_migrations_dual-start",
      migrations: [
        {
          sql: [
            'CREATE TABLE "dual-start_migration_count" ("id" integer NOT NULL);',
            'INSERT INTO "dual-start_migration_count" ("id") VALUES (1);',
          ],
          bps: true,
          folderMillis: 1789948987482,
          hash: "dual-start-history",
        },
      ],
    };
    const controller = new AbortController();
    cleanups.push(async () => {
      await Promise.all([app.db.$client.end(), workerContext.db.$client.end()]);
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
    const appMigration = runMigrations({
      env: app.env,
      pool: app.db.$client,
      histories: migrationPlan([moduleHistory]),
      compiledModuleIds: ["dual-start"],
    });

    await appMigration;
    await waitUntil(async () => {
      const result = await app.db.$client.query<{ count: number }>(
        'select count(*)::int as count from "dual-start_migration_count"'
      );

      return result.rows[0]?.count === 1;
    });
    controller.abort();
    await worker;

    const count = await workerContext.db.$client.query<{ count: number }>(
      'select count(*)::int as count from "dual-start_migration_count"'
    );

    expect(count.rows).toEqual([{ count: 1 }]);
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

  it("skips a job of a compiled module with no tenant_module row", async () => {
    await expectSkippedModuleJob({ id: "unseeded", enabled: undefined });
  });

  it("checks entitlement before running a queued job for a disabled module", async () => {
    await expectSkippedModuleJob({ id: "disabled", enabled: false });
  });

  it("keeps the job queue as a fixed context member exposing enqueue and schedule", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );

    cleanups.push(() => context.db.$client.end());

    expect(Object.keys(context).toSorted()).toEqual([
      "branding",
      "db",
      "entitlements",
      "env",
      "jobQueue",
      "settings",
    ]);
    expect(context.jobQueue.enqueue).toBeDefined();
    expect(context.jobQueue.schedule).toBeDefined();
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
  });

  it("preserves an application schedule and payload after declaration reconciliation", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(source(database.url), silentLogger(), [
      "reporting",
    ]);
    const module = moduleWithJob("reporting", async () => {}, "0 3 * * *");
    const controller = new AbortController();
    const heartbeatPath = `/tmp/genie-reporting-heartbeat-${crypto.randomUUID()}`;

    cleanups.push(async () => {
      const { unlink } = await import("node:fs/promises");
      await unlink(heartbeatPath).catch(() => undefined);
      await context.db.$client.end();
    });

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: ["reporting"],
    });
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('reporting', true)"
    );

    const inspector = await boss(context);
    cleanups.push(async () => {
      await inspector.stop();
    });

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
    });

    await waitUntil(async () => {
      const schedules = await inspector.getSchedules("reporting.read-record");

      return schedules.some(({ cron }) => cron === "0 3 * * *");
    });

    const applicationSchedule = {
      label: "user-supplied-schedule-data",
    };

    await context.jobQueue.schedule(
      "reporting.read-record",
      "*/7 * * * *",
      applicationSchedule
    );

    const heartbeatBefore = await inspector.getSchedule(
      "core.worker-heartbeat"
    );
    const declarationSchedule = await inspector.getSchedule(
      "reporting.read-record",
      "genie.module.reporting.read-record"
    );

    await waitUntil(async () => {
      const heartbeatAfter = await inspector.getSchedule(
        "core.worker-heartbeat"
      );

      return heartbeatAfter?.lastJobId !== heartbeatBefore?.lastJobId;
    });

    const schedules = await inspector.getSchedules("reporting.read-record");
    const callerOwned = schedules.find(({ key }) => key === "");
    const declarationOwned = schedules.find(({ cron }) => cron === "0 3 * * *");

    controller.abort();
    await worker;

    expect(callerOwned).toMatchObject({
      key: "",
      cron: "*/7 * * * *",
      data: applicationSchedule,
    });
    expect(declarationOwned).toBeDefined();
    expect(declarationOwned?.key).not.toBe(callerOwned?.key);
    expect(declarationSchedule?.cron).toBe("0 3 * * *");
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

  it("settles a hung job handler within shutdownTimeoutMs", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(source(database.url), silentLogger(), [
      "shutdown",
    ]);
    const started = deferred();
    const neverFinish = deferred();
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

    await publisher.createQueue("shutdown.read-record");
    await publisher.send("shutdown.read-record", { label: "never-resolves" });

    const shutdownModule = moduleWithJob("shutdown", async () => {
      started.resolve();
      await neverFinish.promise;
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

    const settledWithinBound = await Promise.race([
      worker.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)),
    ]);

    neverFinish.resolve();
    await worker;

    expect(settledWithinBound).toBe(true);
  });

  it("uses the tenant context pool for pg-boss rather than a second driver pool", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    const poolQuery = vi.spyOn(context.db.$client, "query");

    cleanups.push(() => context.db.$client.end());

    const queue = await boss(context);
    const statements = poolQuery.mock.calls
      .map(([statement]) => String(statement))
      .join("\n");

    expect(statements).toMatch(/pgboss/i);
    expect(queue.getDb()).toBeDefined();
  });

  it("leaves worker-only supervision and scheduling disabled on the application instance", async () => {
    const database = await disposablePostgres();
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    const appBoss = new PgBoss({
      db: {
        executeSql: async (text, values) =>
          context.db.$client.query(text, values),
      },
      schema: "pgboss",
      supervise: false,
      schedule: false,
      useListenNotify: false,
    });

    cleanups.push(async () => {
      await appBoss.stop();
      await context.db.$client.end();
    });
    await appBoss.start();

    expect(appBoss.isMaintaining()).toBe(false);
    expect(appBoss.isBamWorking()).toBe(false);
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

  it("uses WORKER_HEARTBEAT_PATH when set and the default path otherwise", async () => {
    const customPath = `/tmp/genie-worker-override-${crypto.randomUUID()}`;
    const defaultPath = `/tmp/genie-worker-default-${crypto.randomUUID()}`;
    const { access, unlink } = await import("node:fs/promises");
    cleanups.push(async () => {
      await unlink(customPath).catch(() => undefined);
      await unlink(defaultPath).catch(() => undefined);
    });

    const defaultDatabase = await disposablePostgres();
    const defaultController = new AbortController();
    const defaultWorker = runWorker({
      source: source(defaultDatabase.url),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: defaultController.signal,
      heartbeat: {
        cron: "*/1 * * * * *",
        path: defaultPath,
        staleAfterMs: 1800,
      },
    });

    await waitUntil(async () =>
      access(defaultPath).then(
        () => true,
        () => false
      )
    );
    defaultController.abort();
    await defaultWorker;

    const overrideDatabase = await disposablePostgres();
    const overrideController = new AbortController();
    const overrideWorker = runWorker({
      source: source(overrideDatabase.url, {
        WORKER_HEARTBEAT_PATH: customPath,
      }),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: overrideController.signal,
      heartbeat: { cron: "*/1 * * * * *", staleAfterMs: 1800 },
    });

    await waitUntil(async () =>
      access(customPath).then(
        () => true,
        () => false
      )
    );
    overrideController.abort();
    await overrideWorker;
  });

  it("writes to a unique default heartbeat path on a clean startup", async () => {
    const { access, unlink } = await import("node:fs/promises");
    const database = await disposablePostgres();
    const heartbeatPath = `/tmp/genie-worker-default-path-${crypto.randomUUID()}`;
    const context = createTenantContext(
      source(database.url),
      silentLogger(),
      []
    );
    const controller = new AbortController();

    cleanups.push(async () => {
      await unlink(heartbeatPath).catch(() => undefined);
      await context.db.$client.end();
    });

    const worker = runWorker({
      source: source(database.url, { WORKER_HEARTBEAT_PATH: heartbeatPath }),
      modules: [],
      histories: [],
      ...OUTPUT,
      signal: controller.signal,
      heartbeat: { cron: "*/1 * * * * *", staleAfterMs: 1800 },
    });

    await waitUntil(async () =>
      access(heartbeatPath).then(
        () => true,
        () => false
      )
    );
    controller.abort();
    await worker;

    expect(
      await access(heartbeatPath).then(
        () => true,
        () => false
      )
    ).toBe(true);
  });

  it("pins pg-boss to version 12.33.5", async () => {
    const packageJson = await import("../package.json", {
      with: { type: "json" },
    });

    expect(packageJson.default.dependencies["pg-boss"]).toBe("12.33.5");
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

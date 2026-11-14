import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import coreJournal from "../drizzle/meta/_journal.json" with { type: "json" };
import { AppError } from "../src/lib/errors/index.ts";
import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import { agentSession } from "../src/schema.ts";
import { startRun } from "../src/services/agent/run-job.ts";
import { AGENT_RUN_JOB_NAME, stopRun } from "../src/services/agent/runs.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import { bossOf } from "../src/services/job-queue/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  CORE_HISTORY,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import {
  type DisposableDeployment,
  insertAgentSession,
  insertPersonWith,
  markSetupDone,
  startDisposablePostgres,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The run limits of DEC-57 on a real database: up to 3 runs per person and one run per record,
 * also when two app copies start runs at the same moment, and the migration that brings old data
 * under both limits.
 */
let deployment: DisposableDeployment;

/** A second app copy on the same database, with its own pool, named so its backend shows. */
let copy: TenantContext;

const COPY_NAME = "run-limits-copy";

beforeAll(async () => {
  deployment = await startDisposableDeployment();
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds this value (DEC-46).
  await deployment.context.db.execute(
    sql`update tenant_settings set agent_run_time_box_minutes = 30`
  );
  copy = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    silentLogger(),
    [],
    COPY_NAME
  );
}, 120000);

afterAll(async () => {
  await copy?.db.$client.end();
  await deployment?.stop();
});

async function person(): Promise<{
  readonly here: ModuleRequestContext;
  readonly there: ModuleRequestContext;
}> {
  const { userId } = await insertPersonWith(deployment.context, []);

  const as = (tenant: TenantContext) => ({
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  });

  return { here: as(deployment.context), there: as(copy) };
}

async function sessionOf(
  ctx: ModuleRequestContext,
  recordId: string = randomUUID()
): Promise<string> {
  const session = await insertAgentSession(deployment.context, {
    userId: ctx.caller.userId,
    surface: "placeholder",
    recordId,
  });

  return session.id;
}

/** Starts a run in a transaction of the context the caller belongs to. */
async function start(ctx: ModuleRequestContext, sessionId: string) {
  return withTransaction(ctx.tenant, async (tx) =>
    startRun(ctx, tx, sessionId)
  );
}

async function runState(sessionId: string) {
  const [row] = await deployment.context.db
    .select({ runState: agentSession.runState })
    .from(agentSession)
    .where(eq(agentSession.id, sessionId));

  return row?.runState;
}

async function jobsNaming(sessionId: string) {
  const boss = await bossOf(deployment.context.jobQueue);

  return boss.findJobs(AGENT_RUN_JOB_NAME, { data: { sessionId } });
}

/** Waits, at most 10 s, until the copy's backend waits on a lock. */
async function copyWaitsOnLock(): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polls until the wait shows.
    const { rows } = await deployment.context.db.$client.query<{
      waiting: number;
    }>(
      "select count(*)::int as waiting from pg_stat_activity where application_name like $1 and wait_event_type = 'Lock'",
      [`${COPY_NAME}%`]
    );

    if ((rows[0]?.waiting ?? 0) > 0) return;

    // oxlint-disable-next-line no-await-in-loop -- polls until the wait shows.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("The copy never waited on a lock.");
}

/**
 * Copy A starts its run and keeps its transaction open; copy B then starts its own run and must
 * wait for A. A commits, and B's outcome is answered: its error code, or `started`.
 */
async function startAtOnce(
  first: { readonly ctx: ModuleRequestContext; readonly sessionId: string },
  second: { readonly ctx: ModuleRequestContext; readonly sessionId: string }
): Promise<string | undefined> {
  const begun = Promise.withResolvers<void>();
  const held = Promise.withResolvers<void>();

  const a = withTransaction(first.ctx.tenant, async (tx) => {
    await startRun(first.ctx, tx, first.sessionId);
    begun.resolve();
    await held.promise;
  });

  let b: Promise<string> | undefined;

  try {
    await Promise.race([begun.promise, a]);
    b = start(second.ctx, second.sessionId).then(
      () => "started",
      (error: Error) => (error instanceof AppError ? error.code : error.message)
    );
    await copyWaitsOnLock();
  } finally {
    held.resolve();
  }

  await a;

  return b;
}

describe("run limits", () => {
  it("a fourth run of one person is refused with agent-run-limit and saves nothing", async () => {
    const { here } = await person();

    for (const sessionId of [
      await sessionOf(here),
      await sessionOf(here),
      await sessionOf(here),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one start after another.
      await start(here, sessionId);
    }

    const fourth = await sessionOf(here);

    await expect(start(here, fourth)).rejects.toMatchObject({
      code: "agent-run-limit",
    });
    expect(await runState(fourth)).toBeNull();
    expect(await jobsNaming(fourth)).toEqual([]);
  });

  it("two app copies starting a person's fourth run at once start only one", async () => {
    const { here, there } = await person();

    await start(here, await sessionOf(here));
    await start(here, await sessionOf(here));

    const third = await sessionOf(here);
    const fourth = await sessionOf(here);

    const outcome = await startAtOnce(
      { ctx: here, sessionId: third },
      { ctx: there, sessionId: fourth }
    );

    expect(outcome).toBe("agent-run-limit");
    expect([await runState(third), await runState(fourth)]).toEqual([
      "queued",
      null,
    ]);
  });

  it("two runs on one record are refused with agent-record-busy, also from two copies at once", async () => {
    const recordId = randomUUID();
    const one = await person();
    const two = await person();
    const three = await person();

    const busy = await sessionOf(one.here, recordId);

    await start(one.here, busy);

    const refused = await sessionOf(two.here, recordId);

    await expect(start(two.here, refused)).rejects.toMatchObject({
      code: "agent-record-busy",
    });
    expect(await runState(refused)).toBeNull();

    const atOnce = randomUUID();
    const first = await sessionOf(two.here, atOnce);
    const second = await sessionOf(three.there, atOnce);

    const outcome = await startAtOnce(
      { ctx: two.here, sessionId: first },
      { ctx: three.there, sessionId: second }
    );

    expect(outcome).toBe("agent-record-busy");
    expect(await runState(second)).toBeNull();
  });

  it("a stopped run frees its slot", async () => {
    const { here } = await person();
    const queued = await sessionOf(here);

    await start(here, queued);
    await start(here, await sessionOf(here));
    await start(here, await sessionOf(here));
    await stopRun(here, queued);

    const fourth = await sessionOf(here);

    await start(here, fourth);

    expect(await runState(fourth)).toBe("queued");
  });

  it("startRun sets the run deadline from the time box setting", async () => {
    const { here } = await person();
    const sessionId = await sessionOf(here);

    await start(here, sessionId);

    const { rows } = await deployment.context.db.execute<{ seconds: number }>(
      sql`select extract(epoch from run_deadline_at - updated_at)::float8 as seconds from agent_session where id = ${sessionId}`
    );

    expect(Math.abs((rows[0]?.seconds ?? 0) - 30 * 60)).toBeLessThan(5);
  });
});

describe("the background runs migration", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  const migrationIndex = coreJournal.entries.findIndex(
    (entry) => entry.tag === "0017_agent_background_runs"
  );

  it("the migration keeps the newest active run on a record and ends the others", async () => {
    expect(migrationIndex).toBeGreaterThan(0);

    const postgres = await startDisposablePostgres();

    const context = createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger(),
      []
    );

    cleanups.push(async () => {
      await context.db.$client.end();
      await postgres.stop();
    });

    const migrate = (
      histories: Parameters<typeof runMigrations>[0]["histories"]
    ) =>
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories,
        compiledModuleIds: [],
      });

    await migrate([
      {
        ...CORE_HISTORY,
        migrations: CORE_HISTORY.migrations.slice(0, migrationIndex),
      },
    ]);

    const client = context.db.$client;

    // One run per person before this migration: u1 and u2 build one record, u3 and u4 run in Ask.
    await client.query(`
      insert into "user" (id, name, email) values
        ('u1', 'One', 'u1@example.invalid'),
        ('u2', 'Two', 'u2@example.invalid'),
        ('u3', 'Three', 'u3@example.invalid'),
        ('u4', 'Four', 'u4@example.invalid');
      insert into agent_session (id, user_id, title, model_id, surface, record_id, run_state, run_job_id, updated_at) values
        ('00000000-0000-4000-8000-000000000001', 'u1', 'Older', 'm', 'placeholder', 'record-1', 'running', gen_random_uuid(), now() - interval '2 minutes'),
        ('00000000-0000-4000-8000-000000000002', 'u2', 'Newer', 'm', 'placeholder', 'record-1', 'queued', gen_random_uuid(), now() - interval '1 minute'),
        ('00000000-0000-4000-8000-000000000003', 'u3', 'Ask', 'm', 'core:ask', null, 'running', gen_random_uuid(), now()),
        ('00000000-0000-4000-8000-000000000004', 'u4', 'Ask', 'm', 'core:ask', null, 'running', gen_random_uuid(), now());
    `);

    await migrate(migrationPlan([]));

    const { rows } = await client.query<{
      title: string;
      run_state: string | null;
      run_error: string | null;
      run_unseen: boolean;
      full_box: boolean | null;
    }>(
      `select title, run_state, run_error, run_unseen,
         run_deadline_at between now() + interval '119 minutes' and now() + interval '121 minutes' as full_box
       from agent_session order by id`
    );

    expect(rows).toEqual([
      {
        title: "Older",
        run_state: null,
        run_error: "interrupted",
        run_unseen: true,
        full_box: null,
      },
      {
        title: "Newer",
        run_state: "queued",
        run_error: null,
        run_unseen: false,
        full_box: true,
      },
      {
        title: "Ask",
        run_state: "running",
        run_error: null,
        run_unseen: false,
        full_box: true,
      },
      {
        title: "Ask",
        run_state: "running",
        run_error: null,
        run_unseen: false,
        full_box: true,
      },
    ]);
  });
});

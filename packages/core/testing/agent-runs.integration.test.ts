import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import { agentSession } from "../src/schema.ts";
import { CONTINUE_TEXT } from "../src/services/agent/continue.ts";
import {
  AGENT_RUN_JOB,
  continueRun,
  retryRun,
  startRun,
} from "../src/services/agent/run-job.ts";
import {
  AGENT_RUN_JOB_NAME,
  endRun,
  stopRun,
} from "../src/services/agent/runs.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import { bossOf } from "../src/services/job-queue/index.ts";
import {
  type DisposableDeployment,
  insertAgentSession,
  insertPersonWith,
  markSetupDone,
  runQueuedAgentRun,
  startDisposableDeployment,
} from "./index.ts";

/** The durable run's start on a real database and pg-boss (Spec 7 R-42b, AC-13, S7-40). */
let deployment: DisposableDeployment;

beforeAll(async () => {
  deployment = await startDisposableDeployment();
  await markSetupDone(deployment.context);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function person(
  tenant = deployment.context,
  permissions: readonly string[] = []
): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, permissions);

  return {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  };
}

async function sessionOf(ctx: ModuleRequestContext) {
  return insertAgentSession(deployment.context, {
    userId: ctx.caller.userId,
    surface: "placeholder",
    // One run per record: each session builds a record of its own.
    recordId: randomUUID(),
  });
}

/** The transaction runs on the deployment's context, so only the run's own queue can differ. */
async function start(ctx: ModuleRequestContext, sessionId: string) {
  return withTransaction(deployment.context, async (tx) =>
    startRun(ctx, tx, sessionId)
  );
}

async function runColumns(sessionId: string) {
  const [row] = await deployment.context.db
    .select({
      runState: agentSession.runState,
      runJobId: agentSession.runJobId,
    })
    .from(agentSession)
    .where(eq(agentSession.id, sessionId));

  return row;
}

/** The text part of every message of the session, in order; a continue message's comes second. */
async function messageTexts(sessionId: string) {
  const { rows } = await deployment.context.db.execute<{ text: string }>(
    sql`select (select p->>'text' from jsonb_array_elements(parts) p where p->>'type' = 'text' limit 1) as text from agent_message where session_id = ${sessionId} order by seq`
  );

  return rows.map(({ text }) => text);
}

/** A run whose first turn runs: started, and taken by its job as the worker takes it. */
async function runningRun(ctx: ModuleRequestContext, sessionId: string) {
  const jobId = await start(ctx, sessionId);

  await deployment.context.db.execute(
    sql`update agent_session set run_state = 'running' where id = ${sessionId}`
  );

  return jobId;
}

async function deadlineOf(sessionId: string) {
  const { rows } = await deployment.context.db.execute<{ deadline: string }>(
    sql`select run_deadline_at::text as deadline from agent_session where id = ${sessionId}`
  );

  return rows[0]?.deadline;
}

async function jobsNaming(sessionId: string) {
  const boss = await bossOf(deployment.context.jobQueue);

  return boss.findJobs(AGENT_RUN_JOB_NAME, { data: { sessionId } });
}

describe("starting an agent run", () => {
  it("startRun queues one job that names only the session, with no retry", async () => {
    const ctx = await person();
    const session = await sessionOf(ctx);

    const jobId = await start(ctx, session.id);

    const boss = await bossOf(deployment.context.jobQueue);
    const [job] = await boss.findJobs(AGENT_RUN_JOB_NAME, { id: jobId });

    expect({
      data: job?.data,
      retryLimit: job?.retryLimit,
      expireInSeconds: job?.expireInSeconds,
    }).toEqual({
      data: {
        "sessionId": session.id,
        "runJobId": jobId,
        "genie:startedBy": ctx.caller.userId,
      },
      retryLimit: 0,
      expireInSeconds: 240,
    });
    expect(await runColumns(session.id)).toEqual({
      runState: "queued",
      runJobId: jobId,
    });
  });

  it("an enqueue failure leaves run_state null", async () => {
    // A queue that createJobQueue did not build refuses the starter's send.
    const broken = {
      ...deployment.context,
      jobQueue: { ...deployment.context.jobQueue },
    };

    const ctx = await person(broken);
    const session = await sessionOf(ctx);

    await expect(start(ctx, session.id)).rejects.toThrow();
    expect(await runColumns(session.id)).toEqual({
      runState: null,
      runJobId: null,
    });
    expect(await jobsNaming(session.id)).toEqual([]);
  });

  it("the job of a stopped run leaves the run that replaced it alone", async () => {
    const ctx = await person();
    const session = await sessionOf(ctx);

    const stoppedJob = await start(ctx, session.id);
    await stopRun(ctx, session.id);
    const replacement = await start(ctx, session.id);

    const boss = await bossOf(deployment.context.jobQueue);
    const [job] = await boss.findJobs(AGENT_RUN_JOB_NAME, { id: stoppedJob });

    // The stopped run's job runs as its starter, as the worker would run it.
    await AGENT_RUN_JOB.handler(
      ctx,
      z.object({ sessionId: z.string(), runJobId: z.string() }).parse(job?.data)
    );

    expect(await runColumns(session.id)).toEqual({
      runState: "queued",
      runJobId: replacement,
    });
  });

  it("Try again is refused while AI is off and stores nothing", async () => {
    // This deployment has no model connection, so AI is off.
    const ctx = await person(deployment.context, ["core:ask:use"]);
    const runJobId = randomUUID();

    const session = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      runJobId,
      runError: "interrupted",
    });

    await expect(retryRun(ctx, session.id)).rejects.toMatchObject({
      code: "ai-off",
    });
    expect({
      messages: await messageTexts(session.id),
      jobs: await jobsNaming(session.id),
      run: await runColumns(session.id),
    }).toEqual({
      messages: [],
      jobs: [],
      run: { runState: null, runJobId },
    });
  });

  it("Stop on a queued run ends it stopped without a model call", async () => {
    const ctx = await person();
    const session = await sessionOf(ctx);

    await start(ctx, session.id);

    const other = await person();

    await expect(stopRun(other, session.id)).rejects.toMatchObject({
      code: "not-found",
    });
    expect((await runColumns(session.id))?.runState).toBe("queued");

    await stopRun(ctx, session.id);

    // A queued run ends at once, so the person is not blocked until its job is fetched.
    expect((await runColumns(session.id))?.runState).toBeNull();

    await runQueuedAgentRun(deployment.context, [], session.id);

    const { rows } = await deployment.context.db.execute<{
      run_state: string | null;
      run_error: string | null;
      messages: number;
    }>(
      sql`select run_state, run_error, (select count(*)::int from agent_message where session_id = ${session.id}) as messages from agent_session where id = ${session.id}`
    );

    expect(rows).toEqual([
      { run_state: null, run_error: "stopped", messages: 0 },
    ]);
  });
});

/** A run as a chain of bounded turns (DEC-57 item 2, S7-49). */
describe("continuing an agent run", () => {
  it("continueRun moves the run to a new queued job of the owner with a hidden continue message, and keeps the deadline", async () => {
    const ctx = await person();
    const session = await sessionOf(ctx);
    const first = await runningRun(ctx, session.id);
    const deadline = await deadlineOf(session.id);

    const next = await continueRun(ctx, session.id, first);

    const boss = await bossOf(deployment.context.jobQueue);
    const [job] = await boss.findJobs(AGENT_RUN_JOB_NAME, { id: next ?? "" });

    const { rows } = await deployment.context.db.execute<{ types: string[] }>(
      sql`select array(select p->>'type' from jsonb_array_elements(parts) p) as types from agent_message where session_id = ${session.id} order by seq desc limit 1`
    );

    expect({
      fresh: next !== null && next !== first,
      run: await runColumns(session.id),
      job: { data: job?.data, expireInSeconds: job?.expireInSeconds },
      texts: await messageTexts(session.id),
      types: rows[0]?.types,
      deadline: await deadlineOf(session.id),
    }).toEqual({
      fresh: true,
      run: { runState: "queued", runJobId: next },
      job: {
        data: {
          "sessionId": session.id,
          "runJobId": next,
          "genie:startedBy": ctx.caller.userId,
        },
        expireInSeconds: 240,
      },
      texts: [CONTINUE_TEXT],
      types: ["data-continue", "text"],
      deadline,
    });
  });

  it("an enqueue failure in continueRun stores no continue message and leaves the run running", async () => {
    const broken = {
      ...deployment.context,
      jobQueue: { ...deployment.context.jobQueue },
    };

    const ctx = await person(broken);
    const session = await sessionOf(ctx);
    // The broken queue refuses a start too, so the first turn is set by SQL.
    const first = randomUUID();

    await deployment.context.db.execute(
      sql`update agent_session set run_state = 'running', run_job_id = ${first} where id = ${session.id}`
    );

    await expect(continueRun(ctx, session.id, first)).rejects.toThrow();
    expect({
      run: await runColumns(session.id),
      texts: await messageTexts(session.id),
    }).toEqual({ run: { runState: "running", runJobId: first }, texts: [] });
  });

  it("continueRun after Stop queues nothing, and the run then ends stopped, not stuck in stopping", async () => {
    const ctx = await person();
    const session = await sessionOf(ctx);
    const first = await runningRun(ctx, session.id);

    // Stop during the turn's last step: the job ends the turn before its watch loop saw Stop.
    await stopRun(ctx, session.id);

    const next = await continueRun(ctx, session.id, first);

    expect({
      next,
      jobs: (await jobsNaming(session.id)).length,
      texts: await messageTexts(session.id),
    }).toEqual({ next: null, jobs: 1, texts: [] });

    await endRun(deployment.context, session.id, first, null);

    const { rows } = await deployment.context.db.execute<{
      run_state: string | null;
      run_error: string | null;
    }>(
      sql`select run_state, run_error from agent_session where id = ${session.id}`
    );

    expect(rows).toEqual([{ run_state: null, run_error: "stopped" }]);
  });

  it("Stop between turns ends the run at once and the queued job does nothing", async () => {
    const ctx = await person();
    const session = await sessionOf(ctx);
    const first = await runningRun(ctx, session.id);

    await continueRun(ctx, session.id, first);
    await stopRun(ctx, session.id);

    const ended = await runColumns(session.id);

    await runQueuedAgentRun(deployment.context, [], session.id);

    const { rows } = await deployment.context.db.execute<{
      run_state: string | null;
      run_error: string | null;
    }>(
      sql`select run_state, run_error from agent_session where id = ${session.id}`
    );

    expect({
      ended: ended?.runState,
      after: rows[0],
      texts: await messageTexts(session.id),
    }).toEqual({
      ended: null,
      after: { run_state: null, run_error: "stopped" },
      texts: [CONTINUE_TEXT],
    });
  });
});

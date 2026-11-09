import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import { agentSession } from "../src/schema.ts";
import { startRun } from "../src/services/agent/run-job.ts";
import { AGENT_RUN_JOB_NAME } from "../src/services/agent/runs.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import { bossOf } from "../src/services/job-queue/index.ts";
import {
  type DisposableDeployment,
  insertAgentSession,
  insertPersonWith,
  markSetupDone,
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
  tenant = deployment.context
): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, []);

  return {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  };
}

async function sessionOf(ctx: ModuleRequestContext) {
  return insertAgentSession(deployment.context, {
    userId: ctx.caller.userId,
    surface: "placeholder",
    recordId: "record-1",
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
      data: { "sessionId": session.id, "genie:startedBy": ctx.caller.userId },
      retryLimit: 0,
      expireInSeconds: 240,
    });
    expect(await runColumns(session.id)).toEqual({
      runState: "queued",
      runJobId: jobId,
    });
  });

  it("a second run for the same person is refused by the index", async () => {
    const ctx = await person();
    const first = await sessionOf(ctx);
    const second = await sessionOf(ctx);

    await start(ctx, first.id);

    await expect(start(ctx, second.id)).rejects.toMatchObject({
      code: "agent-run-active",
    });
    expect(await runColumns(second.id)).toEqual({
      runState: null,
      runJobId: null,
    });
    expect(await jobsNaming(second.id)).toEqual([]);

    await expect(start(ctx, first.id)).rejects.toMatchObject({
      code: "agent-run-active",
    });

    const other = await person();
    const theirs = await sessionOf(other);

    await start(other, theirs.id);

    expect((await runColumns(theirs.id))?.runState).toBe("queued");
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
});

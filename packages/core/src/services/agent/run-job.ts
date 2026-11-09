import { readUIMessageStream } from "ai";
import { and, eq, isNull } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type {
  JobContext,
  JobDeclaration,
  ModuleRequestContext,
} from "../../lib/module-contract/module.ts";
import {
  contextLoggerOf,
  type TenantTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import { agentSession } from "../../schema.ts";
import { pgErrorCode } from "../../utils/error-cause.ts";
import { enqueueJob } from "../job-queue/module-jobs.ts";
import { modelFor } from "../models/index.ts";
import { agentAccess } from "./access.ts";
import { AGENT_LIMITS, turnStream } from "./chat.ts";
import { AGENT_RUN_JOB_NAME, endRun, markRunning } from "./runs.ts";
import { checkedId } from "./store.ts";

/**
 * A session's turn as the core job `core.agent-run` (R-42b, tech plan wave 5): it goes on when the
 * person leaves the page, runs as the person who started it, and is never retried, because a
 * second run would act twice.
 */

/** The turn limit and a minute, so pg-boss fails a crashed run's job within about 5 minutes. */
export const AGENT_RUN_EXPIRE_SECONDS = AGENT_LIMITS.turnMs / 1000 + 60;

/**
 * The job's handler. Only the session's owner runs it, as themselves; a run that is no longer
 * `queued` does not start. The turn reads the stored request, calls the session's model and stores
 * the answer, then the run ends: `failed` after a stream error, a refusal or the turn limit. An
 * error that is not a refusal is thrown, so the worker logs it.
 */
async function runSession(ctx: JobContext, sessionId: string): Promise<void> {
  const { tenant, caller } = ctx;

  const [session] = await tenant.db
    .select({
      userId: agentSession.userId,
      surface: agentSession.surface,
      modelId: agentSession.modelId,
    })
    .from(agentSession)
    .where(eq(agentSession.id, sessionId));

  if (session === undefined) return;

  // Only the person whose chat it is runs it, as `file-job.ts` makes only the asker's file.
  if (caller === undefined || caller.userId !== session.userId) {
    await endRun(tenant, sessionId, "failed");

    return;
  }

  if (!(await markRunning(tenant, sessionId))) return;

  const person = { tenant, caller };

  try {
    const access = await agentAccess(person);

    if (!access.permitted || access.ai !== "on") {
      await endRun(tenant, sessionId, "failed");

      return;
    }

    const model = await modelFor(tenant, {
      task: "chat",
      modelId: session.modelId,
    });

    const limit = AbortSignal.timeout(AGENT_LIMITS.turnMs);
    let failed = false;

    const stream = await turnStream(
      person,
      { id: sessionId, surface: session.surface },
      {
        model,
        abortSignal: limit,
        logError: (cause) =>
          contextLoggerOf(tenant)?.error({ err: cause }, "agent run error"),
      }
    );

    // Reading the stream to its end runs the turn; its `onEnd` stores the answer.
    for await (const state of readUIMessageStream({
      stream,
      onError: () => {
        failed = true;
      },
    })) {
      void state;
    }

    await endRun(tenant, sessionId, failed || limit.aborted ? "failed" : null);
  } catch (error) {
    await endRun(tenant, sessionId, "failed");

    if (!(error instanceof AppError)) throw error;
  }
}

export const AGENT_RUN_JOB: JobDeclaration<{ readonly sessionId: string }> = {
  name: AGENT_RUN_JOB_NAME,
  retry: { limit: 0 },
  handler: async (ctx, { sessionId }) => runSession(ctx, sessionId),
};

/**
 * Queues a run of the caller's own session in the caller's transaction, so the job and the
 * `queued` state commit together, and answers the job id. A session that already runs, or a second
 * run of the same person, is refused with `agent-run-active`; another person's session is
 * `not-found`.
 */
export async function startRun(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  sessionId: string
): Promise<string> {
  const owned = and(
    eq(agentSession.id, checkedId(sessionId)),
    eq(agentSession.userId, ctx.caller.userId)
  );

  const jobId = await enqueueJob(
    ctx,
    AGENT_RUN_JOB,
    { sessionId },
    { tx, expireInSeconds: AGENT_RUN_EXPIRE_SECONDS }
  );

  if (jobId === null) throw new Error("The agent run job was not queued.");

  let moved: readonly { readonly id: string }[];

  try {
    moved = await tx
      .update(agentSession)
      .set({ runState: "queued", runJobId: jobId, runError: null })
      .where(and(owned, isNull(agentSession.runState)))
      .returning({ id: agentSession.id });
  } catch (error) {
    // The partial unique index allows one run per person (R-42b).
    if (error instanceof Error && pgErrorCode(error) === "23505") {
      throw new AppError(CORE_ERRORS["agent-run-active"], { cause: error });
    }

    throw error;
  }

  if (moved.length > 0) return jobId;

  const [found] = await tx
    .select({ id: agentSession.id })
    .from(agentSession)
    .where(owned);

  throw new AppError(
    CORE_ERRORS[found === undefined ? "not-found" : "agent-run-active"]
  );
}

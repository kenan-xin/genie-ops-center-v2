import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

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
import { turnStream } from "./chat.ts";
import { AGENT_LIMITS } from "./limits.ts";
import {
  AGENT_RUN_JOB_NAME,
  endRun,
  markRunning,
  readRunState,
} from "./runs.ts";
import { checkpointParts } from "./stopped-turn.ts";
import { type AgentMessage, appendMessage, checkedId } from "./store.ts";

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
async function runSession(
  ctx: JobContext,
  { sessionId, runJobId }: AgentRunData
): Promise<void> {
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
    await endRun(tenant, sessionId, runJobId, "failed");

    return;
  }

  if (!(await markRunning(tenant, sessionId, runJobId))) {
    // Stopped before it began: nothing runs, and the run ends `stopped`.
    if ((await readRunState(tenant, sessionId)) === "stopping") {
      await endRun(tenant, sessionId, runJobId, null);
    }

    return;
  }

  const person = { tenant, caller };

  const logError = (cause: unknown) =>
    contextLoggerOf(tenant)?.error({ err: cause }, "agent run error");

  const stop = new AbortController();
  let latest: AgentMessage | undefined;
  let changes = 0;
  let stopWatching = NOT_WATCHING;

  try {
    const access = await agentAccess(person);

    if (!access.permitted || access.ai !== "on") {
      await endRun(tenant, sessionId, runJobId, "failed");

      return;
    }

    const model = await modelFor(tenant, {
      task: "chat",
      modelId: session.modelId,
    });

    const limit = AbortSignal.timeout(AGENT_LIMITS.turnMs);
    let failed = false;

    stopWatching = watchRun(person, sessionId, {
      current: () => ({ message: latest, changes }),
      stop,
      logError,
    });

    const stream = await turnStream(
      person,
      { id: sessionId, surface: session.surface },
      {
        model,
        abortSignal: AbortSignal.any([stop.signal, limit]),
        logError,
        // No checkpoint lands after the final save.
        beforeSave: stopWatching,
      }
    );

    // Reading the stream to its end runs the turn; its `onEnd` stores the answer.
    for await (const state of readUIMessageStream({
      stream,
      onError: () => {
        failed = true;
      },
    })) {
      latest = state;
      changes += 1;
    }

    await stopWatching();
    await endRun(
      tenant,
      sessionId,
      runJobId,
      failed || limit.aborted ? "failed" : null
    );
  } catch (error) {
    await stopWatching();
    await endRun(tenant, sessionId, runJobId, "failed");

    // A chat deleted during its run ends the run; the final save's refusal is no fault.
    if (
      !(error instanceof AppError) &&
      (await readRunState(tenant, sessionId)) !== "gone"
    ) {
      throw error;
    }
  }
}

/** Before the turn starts, no watch loop runs. */
async function NOT_WATCHING(): Promise<void> {}

/** How often a run saves its answer so far and reads whether Stop was asked (R-42b). */
const WATCH_INTERVAL_MS = 1000;

/**
 * The run's one watch loop (P11-9). Once a second it reads the run state and aborts `stop` when
 * Stop was asked or the chat is gone, then saves the answer so far by its id when it changed. A
 * failed save is logged and the loop goes on. Answers the function that ends the loop and waits
 * for a save in progress, so a checkpoint never lands after the final answer.
 */
function watchRun(
  person: ModuleRequestContext,
  sessionId: string,
  input: {
    readonly current: () => {
      readonly message: AgentMessage | undefined;
      readonly changes: number;
    };
    readonly stop: AbortController;
    readonly logError: (cause: unknown) => void;
  }
): () => Promise<void> {
  const watching = new AbortController();

  const loop = (async () => {
    let saved = 0;

    /* oxlint-disable no-await-in-loop -- one read and one save per interval, in order. */
    while (!watching.signal.aborted) {
      await sleep(WATCH_INTERVAL_MS, undefined, {
        signal: watching.signal,
      }).catch(() => undefined);

      if (watching.signal.aborted) return;

      try {
        const state = await readRunState(person.tenant, sessionId);

        if (state === "gone" || state === "stopping") input.stop.abort();

        const { message, changes } = input.current();

        if (changes !== saved && message !== undefined && message.id !== "") {
          saved = changes;

          await appendMessage(person, sessionId, {
            id: message.id,
            role: "assistant",
            parts: checkpointParts(structuredClone(message.parts)),
          });
        }
      } catch (cause) {
        if (cause instanceof AppError && cause.code === "not-found") {
          input.stop.abort();
        } else {
          input.logError(cause);
        }
      }
    }
    /* oxlint-enable no-await-in-loop */
  })();

  return async () => {
    watching.abort();
    await loop;
  };
}

/** The run's session and its own job id, so the job acts only on the run it was queued for. */
type AgentRunData = { readonly sessionId: string; readonly runJobId: string };

export const AGENT_RUN_JOB: JobDeclaration<AgentRunData> = {
  name: AGENT_RUN_JOB_NAME,
  retry: { limit: 0 },
  handler: runSession,
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

  // The id is made first, so the job's data can name the run it belongs to.
  const jobId = randomUUID();

  const sent = await enqueueJob(
    ctx,
    AGENT_RUN_JOB,
    { sessionId, runJobId: jobId },
    { tx, id: jobId, expireInSeconds: AGENT_RUN_EXPIRE_SECONDS }
  );

  if (sent !== jobId) throw new Error("The agent run job was not queued.");

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

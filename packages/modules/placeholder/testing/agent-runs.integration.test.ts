import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import {
  AGENT_RUN_JOB,
  type AgentMessage,
  AppError,
  appendMessage,
  callProcedure,
  CONTINUE_TEXT,
  continueRun,
  createAgentRouter,
  handleAgentChat,
  isContinueMessage,
  isRunEndMessage,
  loopText,
  type ModuleRequestContext,
  principalFor,
  readAuditPage,
  readOwnSession,
  registerModuleRuntime,
  startRun,
  stopRun,
  TIME_LIMIT_TEXT,
  validateModule,
  withTransaction,
} from "@genie/core";
import {
  agentRequest,
  enableModules,
  insertAgentSession,
  insertPersonWith,
  lockWaitersReach,
  markSetupDone,
  runQueuedAgentRun,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { insertPlaceholderRecord } from "./factories.ts";
import { PLACEHOLDER_AGENT_RECORDINGS } from "./index.ts";
import { placeholderWithSurface } from "./test-surface.ts";

/**
 * The durable agent run on the placeholder's test surface (Spec 7 R-42b, AC-13, S7-40), with the
 * synthetic timing fixtures `synthetic-run-slow-*`, the synthetic chain `synthetic-chain-*` and the
 * synthetic loop `synthetic-loop-*`.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

const MODULES = [placeholderWithSurface];

const RUN_MODEL = "anthropic/claude-opus-5.5";

const RUN_REQUEST = "Build the placeholder record step by step.";

/** The text that `synthetic-run-slow-1` streams over about 4.8 seconds, before its tool call. */
const NOTE = "Adding the first step of the placeholder record now.";

/**
 * Measured on 2026-11-09 over two runs: Stop ends the run in 0.96 to 1.02 s and a deleted chat in
 * 1.00 s (one 1-second poll and the save). The bound keeps a margin for a loaded machine.
 */
const STOP_BOUND_MS = 2000;

const FINAL_ANSWER = [
  "root = Answer([result])",
  'result = Paragraph("The placeholder record has its first step.")',
].join("\n");

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds these values (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra", RUN_MODEL],
    chat: "openai/gpt-6.1-terra",
    document: RUN_MODEL,
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, MODULES);
  recorded = useRecordedModel(deployment.context, PLACEHOLDER_AGENT_RECORDINGS);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function person(): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:ask:use",
    "placeholder:use",
  ]);

  const tenant = deployment.context;

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}

/**
 * The request that `synthetic-chain-1` to `-10` answer with one call of `placeholder-surface-step`
 * per step, so the first turn reaches the step cap; `synthetic-chain-11` answers the second turn.
 */
const CHAIN_REQUEST = "Build the placeholder record in eleven steps.";

const CHAIN_ANSWER = [
  "root = Answer([result])",
  'result = Paragraph("The placeholder record has all its steps.")',
].join("\n");

/** The request that `synthetic-loop-1` to `-3` answer with the same step call each time. */
const LOOP_REQUEST = "Note the first step of the placeholder record.";

/** A surface session of the person, on a new record, holding the one request. */
async function surfaceSession(
  ctx: ModuleRequestContext,
  request = RUN_REQUEST
): Promise<string> {
  const record = await insertPlaceholderRecord(deployment.context, {
    label: "Built record",
  });

  const session = await insertAgentSession(deployment.context, {
    userId: ctx.caller.userId,
    surface: "placeholder",
    recordId: record.id,
    modelId: RUN_MODEL,
  });

  await appendMessage(ctx, session.id, {
    role: "user",
    parts: [{ type: "text", text: request }],
  });

  return session.id;
}

/** A run whose first turn runs: started, and taken by its job as the worker takes it. */
async function runningRun(ctx: ModuleRequestContext, sessionId: string) {
  const jobId = await start(ctx, sessionId);

  await deployment.context.db.execute(
    sql`update agent_session set run_state = 'running' where id = ${sessionId}`
  );

  return jobId;
}

async function runJobOf(sessionId: string) {
  const { rows } = await deployment.context.db.execute<{
    run_job_id: string | null;
  }>(sql`select run_job_id from agent_session where id = ${sessionId}`);

  return rows[0]?.run_job_id;
}

async function start(ctx: ModuleRequestContext, sessionId: string) {
  return withTransaction(deployment.context, async (tx) =>
    startRun(ctx, tx, sessionId)
  );
}

async function runColumns(sessionId: string) {
  const { rows } = await deployment.context.db.execute<{
    run_state: string | null;
    run_error: string | null;
  }>(
    sql`select run_state, run_error from agent_session where id = ${sessionId}`
  );

  return rows[0];
}

/** Try again through the router, as the chat's button calls it. */
async function retry(ctx: ModuleRequestContext, sessionId: string) {
  return callProcedure(createAgentRouter(), ctx).retry({ id: sessionId });
}

/** The first text part of every message of the session, in order; a continue message's comes second. */
async function messageTexts(sessionId: string) {
  const { rows } = await deployment.context.db.execute<{ text: string }>(
    sql`select (select p->>'text' from jsonb_array_elements(parts) p where p->>'type' = 'text' limit 1) as text from agent_message where session_id = ${sessionId} order by seq`
  );

  return rows.map(({ text }) => text);
}

/** Sends a message through the chat route: "streamed", or the refusal's catalogue code. */
async function send(
  ctx: ModuleRequestContext,
  sessionId: string
): Promise<string> {
  try {
    await handleAgentChat(
      ctx,
      agentRequest({
        sessionId,
        message: {
          id: "client-message-1",
          role: "user",
          parts: [{ type: "text", text: "Make it shorter." }],
        },
      }),
      { logError: () => {} }
    );

    return "streamed";
  } catch (error) {
    return error instanceof AppError
      ? error.code
      : `not an AppError: ${String(error)}`;
  }
}

/** A run that ended with no answer: started, then stopped while still queued. */
async function stoppedSession(ctx: ModuleRequestContext): Promise<string> {
  const sessionId = await surfaceSession(ctx);

  await start(ctx, sessionId);
  await stopRun(ctx, sessionId);

  return sessionId;
}

async function answers(ctx: ModuleRequestContext, sessionId: string) {
  const { messages } = await readOwnSession(ctx, sessionId);

  return messages.filter(({ role }) => role === "assistant");
}

function textsOf(message: AgentMessage | undefined): readonly string[] {
  return (message?.parts ?? []).flatMap((part) =>
    part.type === "text" ? [part.text] : []
  );
}

const POLL_MS = 100;

const WAIT_LIMIT_MS = 15_000;

/**
 * The text of the stored answer the first time it holds some while the run still runs, as a
 * reader polling the chat sees it. Empty when the run ended before any answer showed.
 */
async function partialWhileRunning(
  ctx: ModuleRequestContext,
  sessionId: string
): Promise<string> {
  const until = Date.now() + WAIT_LIMIT_MS;

  /* oxlint-disable no-await-in-loop -- a reader polls the chat once per interval. */
  while (Date.now() < until) {
    if ((await runColumns(sessionId))?.run_state !== "running") {
      if ((await runColumns(sessionId))?.run_state === null) return "";
    } else {
      const text = textsOf((await answers(ctx, sessionId))[0]).join("");

      if (text !== "") return text;
    }

    await sleep(POLL_MS);
  }
  /* oxlint-enable no-await-in-loop */

  return "";
}

/** Milliseconds from now until the session's run_state is null. */
async function msUntilRunEnds(sessionId: string): Promise<number> {
  const started = performance.now();
  const until = Date.now() + WAIT_LIMIT_MS;

  /* oxlint-disable no-await-in-loop -- polls the run state once per interval. */
  while (Date.now() < until) {
    if ((await runColumns(sessionId))?.run_state === null) break;

    await sleep(POLL_MS / 2);
  }
  /* oxlint-enable no-await-in-loop */

  return performance.now() - started;
}

function stoppedMark(message: AgentMessage | undefined): boolean {
  return (message?.parts ?? []).some(({ type }) => type === "data-stopped");
}

/** The model a sent request names, parsed at the transport's boundary. */
const SENT_MODEL = z.object({ model: z.string() });

const SENT_SYSTEM = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
});

const SYSTEM_PARTS = z.array(z.object({ text: z.string() }));

/** The messages of a sent request after its system message. */
function sentMessages(index: number) {
  return SENT_SYSTEM.parse(recorded.sent[index]?.body).messages.filter(
    ({ role }) => role !== "system"
  );
}

/** The person's agent tool rows, newest first, read by an auditor through the audit reader. */
async function toolRows(actorId: string) {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:audit:read",
  ]);

  const page = await readAuditPage({
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
    modules: MODULES,
    filters: {
      query: "",
      actorId,
      action: "core:agent_tool_called",
      targetType: "all",
      range: "custom",
      from: null,
      to: null,
      operatorOnly: false,
    },
    cursor: null,
    limit: 50,
    includeFacets: false,
  });

  return page.events;
}

describe("a durable agent run on the placeholder test surface", () => {
  it("the test surface is a valid declaration", () => {
    expect(validateModule(placeholderWithSurface)).toEqual([]);
  });

  it("a run finishes after its starter disconnects", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    // The starter's transaction commits and ends; nothing of the request is left.
    await start(ctx, sessionId);

    const before = recorded.sent.length;

    await runQueuedAgentRun(deployment.context, MODULES, sessionId);

    const stored = await answers(ctx, sessionId);

    expect({
      run: await runColumns(sessionId),
      answers: stored.length,
      last: textsOf(stored[0]).at(-1),
      models: recorded.sent
        .slice(before)
        .map(({ body }) => SENT_MODEL.parse(body).model),
    }).toEqual({
      run: { run_state: null, run_error: null },
      answers: 1,
      last: FINAL_ANSWER,
      models: [RUN_MODEL, RUN_MODEL],
    });

    // The run job, not only the route, names the session's record (P11-44).
    const { rows } = await deployment.context.db.execute<{
      record_id: string;
    }>(sql`select record_id from agent_session where id = ${sessionId}`);

    const system = SENT_SYSTEM.parse(recorded.sent[before]?.body).messages.find(
      ({ role }) => role === "system"
    )?.content;

    expect(
      SYSTEM_PARTS.parse(system)
        .map(({ text }) => text)
        .join("")
    ).toContain(
      `\nThis chat belongs to the record ${rows[0]?.record_id} of its page.\n`
    );
    expect(await toolRows(ctx.caller.userId)).toMatchObject([
      {
        actor: { id: ctx.caller.userId },
        metadata: {
          sessionId,
          tool: "placeholder-surface-step",
          outcome: "answered",
        },
      },
    ]);
  });

  it("a reader sees a partial answer before the run ends", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await start(ctx, sessionId);

    const run = runQueuedAgentRun(deployment.context, MODULES, sessionId);
    const partial = await partialWhileRunning(ctx, sessionId);

    await run;

    const stored = await answers(ctx, sessionId);

    expect({
      partialIsProperPrefix:
        partial !== "" && partial !== NOTE && NOTE.startsWith(partial),
      answers: stored.length,
      texts: textsOf(stored[0]),
    }).toEqual({
      partialIsProperPrefix: true,
      answers: 1,
      texts: [NOTE, FINAL_ANSWER],
    });
  });

  it("Stop during a slow model call ends the run within about a second and no later tool call runs", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await start(ctx, sessionId);

    const before = recorded.sent.length;
    const run = runQueuedAgentRun(deployment.context, MODULES, sessionId);

    await partialWhileRunning(ctx, sessionId);
    await stopRun(ctx, sessionId);

    const elapsed = await msUntilRunEnds(sessionId);

    await run;

    const [answer] = await answers(ctx, sessionId);
    const note = textsOf(answer).join("");

    expect(elapsed).toBeLessThan(STOP_BOUND_MS);
    expect({
      run: await runColumns(sessionId),
      stopped: stoppedMark(answer),
      partOfNote: note !== "" && note !== NOTE && NOTE.startsWith(note),
      requests: recorded.sent.length - before,
      steps: await toolRows(ctx.caller.userId),
    }).toEqual({
      run: { run_state: null, run_error: "stopped" },
      stopped: true,
      partOfNote: true,
      requests: 1,
      steps: [],
    });
  });

  it("deleting the session ends the run", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await start(ctx, sessionId);

    const before = recorded.sent.length;
    const run = runQueuedAgentRun(deployment.context, MODULES, sessionId);

    await partialWhileRunning(ctx, sessionId);

    const deletedAt = performance.now();

    // The chat's messages cascade with it, as the owner's delete removes them.
    await deployment.context.db.execute(
      sql`delete from agent_session where id = ${sessionId}`
    );
    await run;

    expect({
      settled: performance.now() - deletedAt < STOP_BOUND_MS,
      requests: recorded.sent.length - before,
      steps: await toolRows(ctx.caller.userId),
    }).toEqual({ settled: true, requests: 1, steps: [] });
  });

  it("a run that recovery ended and a new run replaced stops and saves nothing more", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await start(ctx, sessionId);

    const before = recorded.sent.length;
    const run = runQueuedAgentRun(deployment.context, MODULES, sessionId);

    await partialWhileRunning(ctx, sessionId);

    // As `recoverRuns` ends a run whose job expired; then the person starts a new run.
    await deployment.context.db.execute(
      sql`update agent_session set run_state = null, run_error = 'interrupted' where id = ${sessionId}`
    );

    const second = await start(ctx, sessionId);
    const replacedAt = performance.now();

    await run;

    const settled = performance.now() - replacedAt < STOP_BOUND_MS;
    const [answer] = await answers(ctx, sessionId);

    const { rows } = await deployment.context.db.execute<{
      run_job_id: string | null;
      run_state: string | null;
    }>(
      sql`select run_job_id, run_state from agent_session where id = ${sessionId}`
    );

    expect({
      settled,
      requests: recorded.sent.length - before,
      stopped: stoppedMark(answer),
      final: textsOf(answer).includes(FINAL_ANSWER),
      job: rows[0]?.run_job_id,
      state: rows[0]?.run_state,
      steps: await toolRows(ctx.caller.userId),
    }).toEqual({
      settled: true,
      requests: 1,
      stopped: false,
      final: false,
      job: second,
      state: "queued",
      steps: [],
    });
  });

  it("a job whose starter is not the session's owner ends the run without a model call", async () => {
    const owner = await person();
    const sessionId = await surfaceSession(owner);

    const runJobId = await start(owner, sessionId);

    const other = await person();
    const before = recorded.sent.length;

    await AGENT_RUN_JOB.handler(
      { tenant: deployment.context, caller: other.caller },
      { sessionId, runJobId }
    );

    expect({
      run: await runColumns(sessionId),
      requests: recorded.sent.length - before,
      answers: (await answers(owner, sessionId)).length,
    }).toEqual({
      run: { run_state: null, run_error: "failed" },
      requests: 0,
      answers: 0,
    });
  });

  it("a message sent while Try again starts a run is refused and stores nothing", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    const begun = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();

    // Try again's transaction: the run starts and the row stays locked until released.
    const tryAgain = withTransaction(deployment.context, async (tx) => {
      await startRun(ctx, tx, sessionId);
      begun.resolve();
      await held.promise;
    });

    let sent: Promise<string> | undefined;

    try {
      await Promise.race([begun.promise, tryAgain]);
      sent = send(ctx, sessionId);
      await lockWaitersReach(deployment.context, 1);
    } finally {
      held.resolve();
    }

    await tryAgain;

    expect({
      send: await sent,
      texts: await messageTexts(sessionId),
      state: (await runColumns(sessionId))?.run_state,
    }).toEqual({
      send: "agent-run-active",
      texts: [RUN_REQUEST],
      state: "queued",
    });
  });

  it("Try again is refused while a sent message's answer can still stream, and works once the answer is stored", async () => {
    const ctx = await person();
    const sessionId = await stoppedSession(ctx);

    // As the chat route stores the person's message before its answer streams.
    await appendMessage(ctx, sessionId, {
      role: "user",
      parts: [{ type: "text", text: "Make it shorter." }],
    });

    await expect(retry(ctx, sessionId)).rejects.toMatchObject({
      code: "agent-run-active",
    });
    expect({
      texts: await messageTexts(sessionId),
      run: await runColumns(sessionId),
    }).toEqual({
      texts: [RUN_REQUEST, "Make it shorter."],
      run: { run_state: null, run_error: "stopped" },
    });

    await appendMessage(ctx, sessionId, {
      role: "assistant",
      parts: [{ type: "text", text: "Shorter now." }],
    });
    await retry(ctx, sessionId);

    expect({
      texts: await messageTexts(sessionId),
      state: (await runColumns(sessionId))?.run_state,
    }).toEqual({
      texts: [RUN_REQUEST, "Make it shorter.", "Shorter now.", "Try again."],
      state: "queued",
    });
  });

  it("Try again works after a run that ended with no answer", async () => {
    const ctx = await person();
    const sessionId = await stoppedSession(ctx);

    await retry(ctx, sessionId);

    expect({
      texts: await messageTexts(sessionId),
      state: (await runColumns(sessionId))?.run_state,
    }).toEqual({ texts: [RUN_REQUEST, "Try again."], state: "queued" });

    // The second time, Try again's own message and run start came from one transaction.
    await stopRun(ctx, sessionId);
    await retry(ctx, sessionId);

    expect({
      texts: await messageTexts(sessionId),
      state: (await runColumns(sessionId))?.run_state,
    }).toEqual({
      texts: [RUN_REQUEST, "Try again.", "Try again."],
      state: "queued",
    });
  });

  it("an unanswered message older than one turn does not block Try again", async () => {
    const ctx = await person();
    const sessionId = await stoppedSession(ctx);

    await appendMessage(ctx, sessionId, {
      role: "user",
      parts: [{ type: "text", text: "Make it shorter." }],
    });

    // As after a turn of the chat route that stored no answer, four minutes ago.
    await deployment.context.db.execute(
      sql`update agent_message set created_at = created_at - interval '4 minutes' where session_id = ${sessionId} and parts->0->>'text' = 'Make it shorter.'`
    );
    await deployment.context.db.execute(
      sql`update agent_session set updated_at = updated_at - interval '4 minutes' where id = ${sessionId}`
    );

    await retry(ctx, sessionId);

    expect((await messageTexts(sessionId)).at(-1)).toBe("Try again.");
  });

  it("Try again stores the message and queues a run, and is refused while 3 other runs build", async () => {
    const ctx = await person();

    const interrupted = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "placeholder",
      recordId: "record-1",
      runJobId: randomUUID(),
      runError: "interrupted",
    });

    await retry(ctx, interrupted.id);

    expect({
      run: await runColumns(interrupted.id),
      messages: await messageTexts(interrupted.id),
    }).toMatchObject({
      run: { run_state: "queued" },
      messages: ["Try again."],
    });

    await start(ctx, await surfaceSession(ctx));
    await start(ctx, await surfaceSession(ctx));

    const blocked = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "placeholder",
      recordId: "record-2",
      runJobId: randomUUID(),
      runError: "stopped",
    });

    await expect(retry(ctx, blocked.id)).rejects.toMatchObject({
      code: "agent-run-limit",
    });
    expect(await messageTexts(blocked.id)).toEqual([]);

    const neverRan = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "placeholder",
      recordId: "record-3",
    });

    await expect(retry(ctx, neverRan.id)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("a run that reaches the step cap continues in a second turn and ends with one answer", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx, CHAIN_REQUEST);

    const first = await start(ctx, sessionId);
    const before = recorded.sent.length;

    await runQueuedAgentRun(deployment.context, MODULES, sessionId);

    const between = {
      run: await runColumns(sessionId),
      requests: recorded.sent.length - before,
      job: await runJobOf(sessionId),
    };

    await runQueuedAgentRun(deployment.context, MODULES, sessionId);

    const { messages } = await readOwnSession(ctx, sessionId);

    expect({
      between: { ...between, newJob: between.job !== first },
      run: await runColumns(sessionId),
      requests: recorded.sent.length - before,
      lastSent: sentMessages(recorded.sent.length - 1).at(-1),
      roles: messages.map((message) =>
        isContinueMessage(message) ? "continue" : message.role
      ),
      stopped: messages.some(stoppedMark),
      answer: textsOf(messages.at(-1)).at(-1),
    }).toEqual({
      between: {
        run: { run_state: "queued", run_error: null },
        requests: 10,
        job: between.job,
        newJob: true,
      },
      run: { run_state: null, run_error: null },
      requests: 11,
      lastSent: { role: "user", content: CONTINUE_TEXT },
      roles: ["user", "assistant", "continue", "assistant"],
      stopped: false,
      answer: CHAIN_ANSWER,
    });
  });

  it("a run that repeats a tool call ends stopped and says why", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx, LOOP_REQUEST);

    await start(ctx, sessionId);

    const before = recorded.sent.length;

    await runQueuedAgentRun(deployment.context, MODULES, sessionId);

    const { messages } = await readOwnSession(ctx, sessionId);

    expect({
      run: await runColumns(sessionId),
      requests: recorded.sent.length - before,
      roles: messages.map(({ role }) => role),
      last: textsOf(messages.at(-1)),
      marked: isRunEndMessage(messages.at(-1)),
      // The third call's tool already ran in the step the guard stopped after.
      toolCalls: (await toolRows(ctx.caller.userId)).length,
    }).toEqual({
      run: { run_state: null, run_error: "stopped" },
      requests: 3,
      roles: ["user", "assistant", "assistant"],
      last: [loopText("placeholder-surface-step")],
      marked: true,
      toolCalls: 3,
    });
  });

  it("a turn after the deadline ends the run stopped with the time limit message and calls no model", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await start(ctx, sessionId);
    await deployment.context.db.execute(
      sql`update agent_session set run_deadline_at = now() - interval '1 minute' where id = ${sessionId}`
    );

    const before = recorded.sent.length;

    await runQueuedAgentRun(deployment.context, MODULES, sessionId);

    const stored = await answers(ctx, sessionId);

    expect({
      run: await runColumns(sessionId),
      requests: recorded.sent.length - before,
      answers: stored.map(textsOf),
    }).toEqual({
      run: { run_state: null, run_error: "stopped" },
      requests: 0,
      answers: [[TIME_LIMIT_TEXT]],
    });
  });

  it("a deadline that passes during a turn stops the run with the time limit message", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await start(ctx, sessionId);
    // `synthetic-run-slow-1` streams its note for about 4.8 s before its tool call.
    await deployment.context.db.execute(
      sql`update agent_session set run_deadline_at = clock_timestamp() + interval '2 seconds' where id = ${sessionId}`
    );

    const before = recorded.sent.length;

    await runQueuedAgentRun(deployment.context, MODULES, sessionId);

    const stored = await answers(ctx, sessionId);
    const note = textsOf(stored[0]).join("");

    expect({
      run: await runColumns(sessionId),
      requests: recorded.sent.length - before,
      partOfNote: note !== "" && note !== NOTE && NOTE.startsWith(note),
      stopped: stoppedMark(stored[0]),
      last: textsOf(stored.at(-1)),
      steps: await toolRows(ctx.caller.userId),
    }).toEqual({
      run: { run_state: null, run_error: "stopped" },
      requests: 1,
      partOfNote: true,
      stopped: true,
      last: [TIME_LIMIT_TEXT],
      steps: [],
    });
  });

  it("Try again works at once after a run stopped right after a continue message", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await continueRun(ctx, sessionId, await runningRun(ctx, sessionId));
    await stopRun(ctx, sessionId);
    // The continue message is the session's latest change, as a person's unanswered message is.
    await deployment.context.db.execute(
      sql`update agent_session set updated_at = (select max(created_at) from agent_message where session_id = ${sessionId}) where id = ${sessionId}`
    );
    await retry(ctx, sessionId);

    expect({
      texts: await messageTexts(sessionId),
      state: (await runColumns(sessionId))?.run_state,
    }).toEqual({
      texts: [RUN_REQUEST, CONTINUE_TEXT, "Try again."],
      state: "queued",
    });
  });

  it("a continue message that a person's message follows is not sent to the model", async () => {
    const ctx = await person();
    const sessionId = await surfaceSession(ctx);

    await continueRun(ctx, sessionId, await runningRun(ctx, sessionId));
    await stopRun(ctx, sessionId);

    const before = recorded.sent.length;

    const response = await handleAgentChat(
      ctx,
      agentRequest({
        sessionId,
        message: {
          id: "client-message-1",
          role: "user",
          parts: [{ type: "text", text: "Make it shorter." }],
        },
      }),
      { logError: () => {} }
    );

    // Reading the answer sends the request; no recording answers it, and only its body counts.
    await response.text();

    expect({
      requests: recorded.sent.length - before,
      sent: sentMessages(before),
    }).toEqual({
      requests: 1,
      sent: [
        { role: "user", content: RUN_REQUEST },
        { role: "user", content: "Make it shorter." },
      ],
    });
  });

  it("Try again is refused, and stores nothing, when its chat's module is off or its model is not allowed", async () => {
    const ctx = await person();

    // No module of this deployment declares the surface `analytics`.
    const moduleOff = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "analytics",
      runJobId: randomUUID(),
      runError: "interrupted",
    });

    const retiredModel = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "placeholder",
      modelId: "openai/gpt-retired",
      runJobId: randomUUID(),
      runError: "interrupted",
    });

    await expect(retry(ctx, moduleOff.id)).rejects.toMatchObject({
      code: "module-disabled",
    });
    await expect(retry(ctx, retiredModel.id)).rejects.toMatchObject({
      code: "model-not-allowed",
    });
    expect({
      moduleOff: {
        texts: await messageTexts(moduleOff.id),
        state: (await runColumns(moduleOff.id))?.run_state,
      },
      retiredModel: {
        texts: await messageTexts(retiredModel.id),
        state: (await runColumns(retiredModel.id))?.run_state,
      },
    }).toEqual({
      moduleOff: { texts: [], state: null },
      retiredModel: { texts: [], state: null },
    });
  });
});

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

/** Ask's history as the run list (DEC-57 item 11, R13, R14). */
describe("the run list on the placeholder test surface", () => {
  it("history lists every surface's chats, newest first, with run status, unseen flag and the record link", async () => {
    const ctx = await person();

    const record = await insertPlaceholderRecord(deployment.context, {
      label: "Saved record",
    });

    const ask = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      updatedAt: hoursAgo(3),
    });

    const saved = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "placeholder",
      recordId: record.id,
      runJobId: randomUUID(),
      runUnseen: true,
      updatedAt: hoursAgo(2),
    });

    // A surface no module of this deployment declares, as when its module is not in the image.
    const unlisted = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "slides",
      recordId: randomUUID(),
      updatedAt: hoursAgo(1),
    });

    const building = await insertPlaceholderRecord(deployment.context, {
      label: "Building record",
    });

    const { id: running } = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "placeholder",
      recordId: building.id,
    });

    // The start moves the chat to the top of the list.
    await runningRun(ctx, running);

    const other = await person();

    await insertAgentSession(deployment.context, {
      userId: other.caller.userId,
    });

    const history = await callProcedure(createAgentRouter(), ctx).history();

    expect(
      history.map(({ id, surface, run, unseen, agentName, address }) => ({
        id,
        surface,
        run,
        unseen,
        agentName,
        address,
      }))
    ).toEqual([
      {
        id: running,
        surface: "placeholder",
        run: "building",
        unseen: false,
        agentName: "Placeholder agent",
        address: `/placeholder/${building.id}?chat=${running}`,
      },
      {
        id: unlisted.id,
        surface: "slides",
        run: null,
        unseen: false,
        agentName: null,
        address: null,
      },
      {
        id: saved.id,
        surface: "placeholder",
        run: "saved",
        unseen: true,
        agentName: "Placeholder agent",
        address: `/placeholder/${record.id}?chat=${saved.id}`,
      },
      {
        id: ask.id,
        surface: "core:ask",
        run: null,
        unseen: false,
        agentName: null,
        address: null,
      },
    ]);
  });
});

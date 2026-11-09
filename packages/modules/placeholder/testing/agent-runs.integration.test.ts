import { setTimeout as sleep } from "node:timers/promises";

import {
  AGENT_RUN_JOB,
  type AgentMessage,
  appendMessage,
  type ModuleRequestContext,
  principalFor,
  readAuditPage,
  readOwnSession,
  registerModuleRuntime,
  startRun,
  stopRun,
  validateModule,
  withTransaction,
} from "@genie/core";
import {
  enableModules,
  insertAgentSession,
  insertPersonWith,
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
 * synthetic timing fixtures `synthetic-run-slow-*`.
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

/** A surface session of the person, on a new record, holding the one request. */
async function surfaceSession(ctx: ModuleRequestContext): Promise<string> {
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
    parts: [{ type: "text", text: RUN_REQUEST }],
  });

  return session.id;
}

async function start(ctx: ModuleRequestContext, sessionId: string) {
  await withTransaction(deployment.context, async (tx) =>
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

  it("a job whose starter is not the session's owner ends the run without a model call", async () => {
    const owner = await person();
    const sessionId = await surfaceSession(owner);

    await start(owner, sessionId);

    const other = await person();
    const before = recorded.sent.length;

    await AGENT_RUN_JOB.handler(
      { tenant: deployment.context, caller: other.caller },
      { sessionId }
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
});

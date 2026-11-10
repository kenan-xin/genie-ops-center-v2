import { randomUUID } from "node:crypto";

import {
  callProcedure,
  handleAgentChat,
  listOwnArtifacts,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import {
  agentRequest,
  enableModules,
  insertPersonWith,
  markSetupDone,
  readAgentReply,
  runQueuedAgentRun,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { analyticsModule, analyticsRouter } from "@genie/module-analytics";
import { insertDashboard } from "@genie/module-analytics/testing";
import { invoicesModule } from "@genie/module-invoices";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ANALYTICS_ADD_ANSWER,
  ANALYTICS_CHAT_DASHBOARD,
  ANALYTICS_CHAT_KEYS,
  ANALYTICS_CHAT_MESSAGE,
  ANALYTICS_FILTER_ANSWER,
  ANALYTICS_FILTER_MESSAGE,
  ANALYTICS_FILTERS,
  ANALYTICS_HANDOFF_MESSAGE,
  ANALYTICS_HANDOFF_TITLE,
  ANALYTICS_QUESTION,
  ANALYTICS_QUESTION_MESSAGE,
  ANALYTICS_SHOW_ANSWER,
  ANALYTICS_VIEW,
  ANALYTICS_VIEW_ANSWER,
  ANALYTICS_VIEW_MESSAGE,
  HANDOFF_PANEL_TITLES,
  OUT_OF_TOOLS_ASK_ANSWER,
  OUT_OF_TOOLS_ASK_MESSAGE,
  OUT_OF_TOOLS_DASHBOARD_ANSWER,
  OUT_OF_TOOLS_DASHBOARD_MESSAGE,
  QUESTION_DASHBOARD_NAME,
  UNALLOCATED_PANEL,
} from "./analytics-chat.ts";
import { APP_AGENT_RECORDINGS } from "./model-replay.ts";

/**
 * A dashboard changed by the Dashboards agent beside it, with the recorded model (Spec 7 R-42b,
 * R-46, R-47, R-49, AC-13): the write tool saves through the store, so each change has Undo and an
 * audit row. Ask hands a dashboard over and the run adds its panels one by one, and a chart request
 * that names no place asks first (`synthetic-dashboard-*`). The modules come in the order of the
 * app's generated selection, so the tool list equals the dev e2e list. The replayed follow-up
 * request holds the tool output, so it also proves the output holds no clock.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

const MODULES = [analyticsModule, invoicesModule, placeholderModule];

const errors: unknown[] = [];

let asker: ModuleRequestContext;

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds these values (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
    chat: "openai/gpt-6.1-terra",
    document: "anthropic/claude-opus-5.5",
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, [
    "analytics",
    "invoices",
    "placeholder",
  ]);
  registerModuleRuntime(deployment.context, MODULES);
  recorded = useRecordedModel(deployment.context, APP_AGENT_RECORDINGS);

  asker = await newAsker();

  await insertDashboard(deployment.context, {
    ...ANALYTICS_CHAT_DASHBOARD,
    ownerUserId: asker.caller.userId,
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

/** A new person with the chat keys, so each case owns its dashboard names. */
async function newAsker(): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, [
    ...ANALYTICS_CHAT_KEYS,
  ]);

  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}

/**
 * Sends a message as the panel does: on a dashboard page, bound to the Dashboards surface and the
 * dashboard (P11-26); else Ask's panel beside the Dashboards list.
 */
async function send(
  ctx: ModuleRequestContext,
  sessionId: string,
  text: string,
  dashboardId?: string
): Promise<void> {
  const page =
    dashboardId === undefined
      ? { context: { page: "Dashboards" } }
      : {
          context: {
            page: "Dashboard",
            record: { type: "analytics-dashboard", id: dashboardId },
          },
          surface: { id: "analytics", recordId: dashboardId },
        };

  const reply = await handleAgentChat(
    ctx,
    agentRequest({
      sessionId,
      message: {
        id: "client-message",
        role: "user",
        parts: [{ type: "text", text }],
      },
      ...page,
    }),
    { logError: (cause: unknown) => errors.push(cause) }
  );

  // A miss ends the stream with an error chunk, which the reader throws; the logged error says why.
  await readAgentReply(reply).catch((error: Error) => errors.push(error));
}

/** A dashboard's panel titles, Undo length and version. */
const dashboardOf = async (id: string) =>
  (
    await deployment.context.db.$client.query<{
      name: string;
      titles: string[];
      undo: number;
      version: number;
    }>(
      "select name, coalesce((select array_agg(p->'config'->>'title') from jsonb_array_elements(config->'panels') p), '{}') as titles, jsonb_array_length(undo) as undo, version from dashboard where id = $1",
      [id]
    )
  ).rows[0];

/** The ids of a person's dashboards. */
const dashboardIdsOf = async (userId: string) =>
  (
    await deployment.context.db.$client.query<{ id: string }>(
      "select id from dashboard where owner_user_id = $1",
      [userId]
    )
  ).rows.map(({ id }) => id);

/** The tool calls of one session, in order, with their outcomes. */
const callsOf = async (sessionId: string) =>
  (
    await deployment.context.db.$client.query(
      "select metadata->>'tool' as tool, metadata->>'outcome' as outcome from audit_event where action = 'core:agent_tool_called' and metadata->>'sessionId' = $1 order by occurred_at, ctid",
      [sessionId]
    )
  ).rows;

/** The text of a session's last answer. */
const lastAnswerText = async (sessionId: string) =>
  (
    await deployment.context.db.$client.query<{
      parts: { type: string; text?: string }[];
    }>(
      "select parts from agent_message where session_id = $1 and role = 'assistant' order by seq desc limit 1",
      [sessionId]
    )
  ).rows[0]?.parts
    .map(({ text }) => text ?? "")
    .join("");

/** A Dashboards chat on a new empty dashboard of a new person, after the question. */
async function askedOnEmptyDashboard() {
  const ctx = await newAsker();

  const dashboardId = await insertDashboard(deployment.context, {
    ownerUserId: ctx.caller.userId,
    name: QUESTION_DASHBOARD_NAME,
  });

  const sessionId = randomUUID();

  await send(ctx, sessionId, ANALYTICS_QUESTION_MESSAGE, dashboardId);

  return { ctx, dashboardId, sessionId };
}

const rowOf = async () =>
  (
    await deployment.context.db.$client.query(
      "select config, jsonb_array_length(undo) as undo, version from dashboard where id = $1",
      [ANALYTICS_CHAT_DASHBOARD.id]
    )
  ).rows[0];

describe("the analytics chat beside a dashboard", () => {
  it("answers a request outside the tools with one sentence of what it can change, in Ask and on a dashboard", async () => {
    const ctx = await newAsker();

    const dashboardId = await insertDashboard(deployment.context, {
      ownerUserId: ctx.caller.userId,
      name: QUESTION_DASHBOARD_NAME,
    });

    const askId = randomUUID();
    const dashboardChat = randomUUID();

    errors.length = 0;
    await send(ctx, askId, OUT_OF_TOOLS_ASK_MESSAGE);
    await send(ctx, dashboardChat, OUT_OF_TOOLS_DASHBOARD_MESSAGE, dashboardId);

    expect(errors).toEqual([]);
    expect(await lastAnswerText(askId)).toContain(OUT_OF_TOOLS_ASK_ANSWER);
    expect(await lastAnswerText(dashboardChat)).toContain(
      OUT_OF_TOOLS_DASHBOARD_ANSWER
    );
    // An answer, no step: neither chat called a tool.
    expect([
      ...(await callsOf(askId)),
      ...(await callsOf(dashboardChat)),
    ]).toEqual([]);
  });

  it("adds the recorded panel with one Undo entry and one audit row, and Undo restores the empty dashboard", async () => {
    const sessionId = "0b9f3c1e-2d4a-4e5f-8a6b-7c8d9e0f1a2b";

    // The message names the panel, so no question comes first.
    await send(
      asker,
      sessionId,
      ANALYTICS_CHAT_MESSAGE,
      ANALYTICS_CHAT_DASHBOARD.id
    );

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    // One panel: `toMatchObject` keeps an array's length.
    expect(await rowOf()).toMatchObject({
      config: {
        filters: { dateRange: { preset: "all" }, fields: [] },
        panels: [
          {
            id: "p1",
            layout: { columns: 1, rows: 1 },
            config: UNALLOCATED_PANEL,
          },
        ],
      },
      undo: 1,
      version: 2,
    });

    // The model reads as it likes before its one change; the read order is its choice.
    const calls = await callsOf(sessionId);

    expect(calls.filter(({ outcome }) => outcome !== "answered")).toEqual([]);
    expect(
      calls.filter(({ tool }) => tool === "analytics-change-dashboard")
    ).toHaveLength(1);

    await callProcedure(analyticsRouter, asker).undoDashboard({
      id: ANALYTICS_CHAT_DASHBOARD.id,
      expectedVersion: 2,
    });

    expect(await rowOf()).toMatchObject({
      config: { panels: [] },
      undo: 0,
      version: 3,
    });
  });

  it("a filter request saves the Customer multi-select and the 3-month range in one set-filters change", async () => {
    const ctx = await newAsker();

    const dashboardId = await insertDashboard(deployment.context, {
      ownerUserId: ctx.caller.userId,
      name: ANALYTICS_CHAT_DASHBOARD.name,
    });

    const sessionId = randomUUID();

    errors.length = 0;
    await send(ctx, sessionId, ANALYTICS_FILTER_MESSAGE, dashboardId);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await callsOf(sessionId)).toEqual([
      { tool: "analytics-change-dashboard", outcome: "answered" },
    ]);

    const { rows } = await deployment.context.db.$client.query(
      "select config->'filters' as filters, jsonb_array_length(undo) as undo, version from dashboard where id = $1",
      [dashboardId]
    );

    expect(rows).toEqual([{ filters: ANALYTICS_FILTERS, undo: 1, version: 2 }]);
    expect(await lastAnswerText(sessionId)).toContain(ANALYTICS_FILTER_ANSWER);
  });

  it("a view request saves a new view and makes it the default in one change", async () => {
    const ctx = await newAsker();

    const dashboardId = await insertDashboard(deployment.context, {
      ownerUserId: ctx.caller.userId,
      name: ANALYTICS_CHAT_DASHBOARD.name,
    });

    const sessionId = randomUUID();

    errors.length = 0;
    await send(ctx, sessionId, ANALYTICS_VIEW_MESSAGE, dashboardId);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await callsOf(sessionId)).toEqual([
      { tool: "analytics-change-dashboard", outcome: "answered" },
    ]);

    const { rows } = await deployment.context.db.$client.query(
      "select config->'views' as views, config->>'defaultViewId' as default_view_id, jsonb_array_length(undo) as undo, version from dashboard where id = $1",
      [dashboardId]
    );

    expect(rows).toEqual([
      { views: [ANALYTICS_VIEW], default_view_id: "v1", undo: 1, version: 2 },
    ]);
    expect(await lastAnswerText(sessionId)).toContain(ANALYTICS_VIEW_ANSWER);
  });

  it("Ask hands a dashboard to the Dashboards agent, and the run adds its three panels one by one", async () => {
    const ctx = await newAsker();
    const askId = randomUUID();

    await send(ctx, askId, ANALYTICS_HANDOFF_MESSAGE);

    const { rows: targets } = await deployment.context.db.$client.query<{
      id: string;
      record_id: string;
    }>(
      "select id, record_id from agent_session where handed_from_session_id = $1",
      [askId]
    );

    const [target] = targets;
    const runStart = recorded.sent.length;

    await runQueuedAgentRun(deployment.context, MODULES, target?.id ?? "");

    const runRequests = recorded.sent.length - runStart;

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(targets).toHaveLength(1);
    expect(await callsOf(askId)).toEqual([
      { tool: "hand-over", outcome: "handed-over" },
    ]);

    const { rows: ended } = await deployment.context.db.$client.query(
      "select run_state, run_error from agent_session where id = $1",
      [target?.id]
    );

    expect(ended).toEqual([{ run_state: null, run_error: null }]);
    // 4 with these fixtures: three changes and the answer, no read in between.
    expect(runRequests).toBeGreaterThanOrEqual(4);
    expect(runRequests).toBeLessThanOrEqual(10);
    expect(await callsOf(target?.id ?? "")).toEqual(
      HANDOFF_PANEL_TITLES.map(() => ({
        tool: "analytics-change-dashboard",
        outcome: "answered",
      }))
    );
    // Exactly one more dashboard of the person: the handed-over one, filled panel by panel.
    expect(await dashboardIdsOf(ctx.caller.userId)).toEqual([
      target?.record_id,
    ]);
    expect(await dashboardOf(target?.record_id ?? "")).toEqual({
      name: ANALYTICS_HANDOFF_TITLE,
      titles: [...HANDOFF_PANEL_TITLES],
      undo: 3,
      version: 4,
    });

    const { rows: audit } = await deployment.context.db.$client.query(
      "select action from audit_event where target_id = $1 order by occurred_at, ctid",
      [target?.record_id]
    );

    expect(audit.map(({ action }) => action)).toEqual([
      "analytics:dashboard-created",
      ...HANDOFF_PANEL_TITLES.map(() => "analytics:dashboard-changed"),
    ]);
  });

  it("on a dashboard, a chart request asks first, and Add adds the panel with one Undo entry that Undo restores", async () => {
    const { ctx, dashboardId, sessionId } = await askedOnEmptyDashboard();

    expect(errors).toEqual([]);
    expect(await lastAnswerText(sessionId)).toContain(ANALYTICS_QUESTION);
    expect(await dashboardOf(dashboardId)).toMatchObject({
      titles: [],
      version: 1,
    });

    await send(ctx, sessionId, ANALYTICS_ADD_ANSWER, dashboardId);

    expect(errors).toEqual([]);
    expect(
      (await callsOf(sessionId)).filter(
        ({ tool }) => tool === "analytics-change-dashboard"
      )
    ).toEqual([{ tool: "analytics-change-dashboard", outcome: "answered" }]);
    expect(await dashboardOf(dashboardId)).toMatchObject({
      titles: ["Monthly collections (SGD)"],
      undo: 1,
      version: 2,
    });

    await callProcedure(analyticsRouter, ctx).undoDashboard({
      id: dashboardId,
      expectedVersion: 2,
    });

    expect(await dashboardOf(dashboardId)).toMatchObject({
      titles: [],
      undo: 0,
    });
  });

  it("the answer Just show it here makes an artifact in the chat and leaves the dashboard as it was", async () => {
    const { ctx, dashboardId, sessionId } = await askedOnEmptyDashboard();

    await send(ctx, sessionId, ANALYTICS_SHOW_ANSWER, dashboardId);

    expect(errors).toEqual([]);
    expect(
      (await listOwnArtifacts(ctx, sessionId)).map(({ kind, title }) => ({
        kind,
        title,
      }))
    ).toEqual([{ kind: "chart", title: "Monthly collections (SGD)" }]);
    expect(await dashboardOf(dashboardId)).toEqual({
      name: QUESTION_DASHBOARD_NAME,
      titles: [],
      undo: 0,
      version: 1,
    });
  });
});

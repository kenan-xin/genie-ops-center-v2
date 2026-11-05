import {
  callProcedure,
  handleAgentChat,
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
  ANALYTICS_CHAT_DASHBOARD,
  ANALYTICS_CHAT_KEYS,
  ANALYTICS_CHAT_MESSAGE,
  UNALLOCATED_PANEL,
} from "./analytics-chat.ts";
import { APP_AGENT_RECORDINGS } from "./model-replay.ts";

/**
 * A dashboard changed by chat beside it, with the recorded model (Spec 7 R-46, R-47, R-49): the
 * write tool saves through the store, so the change has Undo and an audit row. The modules come in
 * the order of the app's generated selection, so the tool list equals the dev e2e list. The
 * replayed follow-up request holds the tool output, so it also proves the output holds no clock.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

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
  useRecordedModel(deployment.context, APP_AGENT_RECORDINGS);

  const { userId } = await insertPersonWith(deployment.context, [
    ...ANALYTICS_CHAT_KEYS,
  ]);

  asker = {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };

  await insertDashboard(deployment.context, {
    ...ANALYTICS_CHAT_DASHBOARD,
    ownerUserId: userId,
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

const rowOf = async () =>
  (
    await deployment.context.db.$client.query(
      "select config, jsonb_array_length(undo) as undo, version from dashboard where id = $1",
      [ANALYTICS_CHAT_DASHBOARD.id]
    )
  ).rows[0];

const toolCalls = async () =>
  (
    await deployment.context.db.$client.query(
      "select metadata->>'tool' as tool, metadata->>'outcome' as outcome from audit_event where action = 'core:agent_tool_called'"
    )
  ).rows;

describe("the analytics chat beside a dashboard", () => {
  it("adds the recorded panel with one Undo entry and one audit row, and Undo restores the empty dashboard", async () => {
    const reply = await handleAgentChat(
      asker,
      agentRequest({
        sessionId: "0b9f3c1e-2d4a-4e5f-8a6b-7c8d9e0f1a2b",
        message: {
          id: "client-message",
          role: "user",
          parts: [{ type: "text", text: ANALYTICS_CHAT_MESSAGE }],
        },
        context: {
          page: "Dashboard",
          record: {
            type: "analytics-dashboard",
            id: ANALYTICS_CHAT_DASHBOARD.id,
          },
        },
      }),
      { logError: (cause: unknown) => errors.push(cause) }
    );

    // A miss ends the stream with an error chunk, which the reader throws; the logged error says why.
    await readAgentReply(reply).catch((error: Error) => errors.push(error));

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    // One panel: `toMatchObject` keeps an array's length.
    expect(await rowOf()).toMatchObject({
      config: {
        filters: { dateRange: { preset: "all" }, field: null },
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
    const calls = await toolCalls();

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
});

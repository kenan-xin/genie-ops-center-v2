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
import { analyticsModule } from "@genie/module-analytics";
import { invoicesModule } from "@genie/module-invoices";
import { seedDemoHistory } from "@genie/module-invoices/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { slidesModule, slidesRouter } from "@genie/module-slides";
import { insertDeck } from "@genie/module-slides/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { APP_AGENT_RECORDINGS } from "./model-replay.ts";
import {
  FIELD_MESSAGE,
  SLIDES_CHANGE_CONTENT,
  SLIDES_CHANGE_CONTEXT,
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
  SLIDES_CHANGE_FIGURE,
  SLIDES_CHANGE_FIX_MESSAGE,
  SLIDES_CHANGE_FIX_TITLE,
  SLIDES_CHANGE_FROZEN_ON,
  SLIDES_CHANGE_MESSAGE,
  SLIDES_CHANGE_NEW_TITLE,
  SLIDES_CHANGE_OLD_TITLE,
} from "./slides-change.ts";
import { SLIDES_CHAT_KEYS } from "./slides-chat.ts";

/**
 * A change to the open deck by chat on the deck editor, with the recorded model (Spec 7 R-46,
 * R-53, S7-31, czjw.63, czjw.79): the page context names the deck and the shown slide, the agent
 * reads the deck and saves one change through `slides-change-deck`, and a refused input returns
 * its field message to the model. The modules come in the order of the app's generated selection.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const MODULES = [
  analyticsModule,
  invoicesModule,
  placeholderModule,
  slidesModule,
];

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
    "slides",
  ]);
  registerModuleRuntime(deployment.context, MODULES);

  const seeder = await insertPersonWith(deployment.context, [
    "invoices:read",
    "invoices:write",
    "invoices:use",
  ]);

  await seedDemoHistory(deployment.context, { userId: seeder.userId });
  useRecordedModel(deployment.context, APP_AGENT_RECORDINGS);

  const { userId } = await insertPersonWith(deployment.context, [
    ...SLIDES_CHAT_KEYS,
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
}, 240000);

afterAll(async () => {
  await deployment?.stop();
});

// Every case inserts the fixed deck, so each starts with no deck and no errors.
beforeEach(async () => {
  errors.length = 0;
  await deployment.context.db.$client.query("delete from deck where id = $1", [
    SLIDES_CHANGE_DECK_ID,
  ]);
});

/** Inserts the fixed deck for the given owner. */
const insertFixedDeck = (ownerUserId: string) =>
  insertDeck(deployment.context, {
    ownerUserId,
    id: SLIDES_CHANGE_DECK_ID,
    title: SLIDES_CHANGE_DECK_TITLE,
    // SAFETY: the fixture holds the stored deck shape; the store's parse refuses any other.
    content: SLIDES_CHANGE_CONTENT as never,
    frozenOn: SLIDES_CHANGE_FROZEN_ON,
  });

/** Sends the message with the deck page's context on slide `s2`, as the panel does. */
async function chat(sessionId: string, text: string): Promise<void> {
  const reply = await handleAgentChat(
    asker,
    agentRequest({
      sessionId,
      message: {
        id: "client-message",
        role: "user",
        parts: [{ type: "text", text }],
      },
      context: SLIDES_CHANGE_CONTEXT,
    }),
    { logError: (cause: unknown) => errors.push(cause) }
  );

  // A miss ends the stream with an error chunk, which the reader throws; the logged error says why.
  await readAgentReply(reply).catch((error: Error) => errors.push(error));
}

const toolCalls = async (sessionId: string) =>
  (
    await deployment.context.db.$client.query(
      "select metadata->>'tool' as tool, metadata->>'outcome' as outcome from audit_event where action = 'core:agent_tool_called' and metadata->>'sessionId' = $1 order by occurred_at, ctid",
      [sessionId]
    )
  ).rows;

/** The fixed deck's slide `s2` elements and its undo length. */
const fixedDeck = async () =>
  (
    await deployment.context.db.$client.query<{
      s2: { kind: string; text?: string; data?: unknown }[];
      undo: number;
      content_hash: string;
    }>(
      "select content->'slides'->1->'elements' as s2, jsonb_array_length(undo) as undo, content_hash from deck where id = $1",
      [SLIDES_CHANGE_DECK_ID]
    )
  ).rows[0];

/** The parts of the stored answer of a session. */
const answerParts = async (sessionId: string) =>
  (
    await deployment.context.db.$client.query<{
      parts: { type: string; state?: string; errorText?: string }[];
    }>(
      "select parts from agent_message where session_id = $1 and role = 'assistant' order by seq",
      [sessionId]
    )
  ).rows.flatMap(({ parts }) => parts);

describe("the agent panel on the deck editor", () => {
  it("changes the open slide by chat with one Undo entry, keeps its figure, and Undo restores it", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0006";

    await insertFixedDeck(asker.caller.userId);
    await chat(session, SLIDES_CHANGE_MESSAGE);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await toolCalls(session)).toEqual([
      { tool: "slides-read-deck", outcome: "answered" },
      { tool: "slides-change-deck", outcome: "answered" },
    ]);

    const changed = await fixedDeck();

    expect(changed).toMatchObject({
      s2: [
        { kind: "title", text: SLIDES_CHANGE_NEW_TITLE },
        { kind: "figure" },
      ],
      undo: 1,
    });
    // The figure came back with its chart as read, so it kept its frozen data (R-54).
    expect(changed?.s2[1]?.data).toEqual(SLIDES_CHANGE_FIGURE.data);

    await callProcedure(slidesRouter, asker).undoDeck({
      id: SLIDES_CHANGE_DECK_ID,
      expectedHash: changed?.content_hash ?? "",
    });

    expect(await fixedDeck()).toMatchObject({
      s2: [
        { kind: "title", text: SLIDES_CHANGE_OLD_TITLE },
        { kind: "figure" },
      ],
      undo: 0,
    });
  });

  it("refuses another person's deck named by the page context, and changes nothing", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0007";

    const other = await insertPersonWith(deployment.context, [
      ...SLIDES_CHAT_KEYS,
    ]);

    await insertFixedDeck(other.userId);

    const before = await fixedDeck();

    await chat(session, SLIDES_CHANGE_MESSAGE);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await toolCalls(session)).toEqual([
      { tool: "slides-read-deck", outcome: "not-found" },
    ]);
    expect(await fixedDeck()).toEqual(before);
  });

  it("returns a slide title over the limit to the model as its field message, and the fixed call saves one change", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0005";

    await insertFixedDeck(asker.caller.userId);
    await chat(session, SLIDES_CHANGE_FIX_MESSAGE);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(
      (await toolCalls(session)).filter(
        ({ tool }) => tool === "slides-change-deck"
      )
    ).toEqual([
      { tool: "slides-change-deck", outcome: "invalid-input" },
      { tool: "slides-change-deck", outcome: "answered" },
    ]);
    expect(
      (await answerParts(session)).find(
        ({ type }) => type === "tool-slides-change-deck"
      )
    ).toMatchObject({ state: "output-error", errorText: FIELD_MESSAGE });
    expect(await fixedDeck()).toMatchObject({
      s2: [
        { kind: "title", text: SLIDES_CHANGE_FIX_TITLE },
        { kind: "figure" },
      ],
      undo: 1,
    });
  });
});

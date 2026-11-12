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
  SLIDES_DATED_CONTENT,
  SLIDES_DATED_FROZEN_ON,
  SLIDES_FIGURE_DATED_MESSAGE,
  SLIDES_FIGURE_READ_MESSAGE,
  SLIDES_FIGURE_SAME_MESSAGE,
  SLIDES_FIGURE_WRITE_MESSAGE,
  SLIDES_NOTES_MESSAGE,
  SLIDES_NOTES_TEXT,
  SLIDES_OUT_OF_TOOLS_ANSWER,
  SLIDES_OUT_OF_TOOLS_MESSAGE,
  SLIDES_STYLE_BACKGROUND,
  SLIDES_STYLE_MESSAGE,
  SLIDES_SAME_CONTENT,
  SLIDES_TITLE_SLIDE_CONTEXT,
  SLIDES_TYPED_CONTENT,
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

/** Inserts the fixed deck for the given owner, by default with the fixed content and date. */
const insertFixedDeck = (
  ownerUserId: string,
  deck: { readonly content?: unknown; readonly frozenOn?: string } = {}
) =>
  insertDeck(deployment.context, {
    ownerUserId,
    id: SLIDES_CHANGE_DECK_ID,
    title: SLIDES_CHANGE_DECK_TITLE,
    // SAFETY: the fixture holds the stored deck shape; the store's parse refuses any other.
    content: (deck.content ?? SLIDES_CHANGE_CONTENT) as never,
    frozenOn: deck.frozenOn ?? SLIDES_CHANGE_FROZEN_ON,
  });

/**
 * Sends the message with the deck page's context on slide `s2`, in a chat bound to the Slides
 * surface and the deck, as the panel on the deck page does (P11-26).
 */
async function chat(
  sessionId: string,
  text: string,
  context:
    | typeof SLIDES_CHANGE_CONTEXT
    | typeof SLIDES_TITLE_SLIDE_CONTEXT = SLIDES_CHANGE_CONTEXT
): Promise<void> {
  const reply = await handleAgentChat(
    asker,
    agentRequest({
      sessionId,
      message: {
        id: "client-message",
        role: "user",
        parts: [{ type: "text", text }],
      },
      context,
      surface: { id: "slides", recordId: SLIDES_CHANGE_DECK_ID },
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
      parts: {
        type: string;
        state?: string;
        errorText?: string;
        text?: string;
      }[];
    }>(
      "select parts from agent_message where session_id = $1 and role = 'assistant' order by seq",
      [sessionId]
    )
  ).rows.flatMap(({ parts }) => parts);

/** The text of the stored answer of a session. */
const answerText = async (sessionId: string): Promise<string> =>
  (await answerParts(sessionId))
    .flatMap(({ type, text }) => (type === "text" && text ? [text] : []))
    .join("\n");

/** The distinct money amounts in a text, in the order of first appearance. */
const amountsIn = (text: string): string[] => [
  ...new Set(text.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g)),
];

/** A session's tool calls as `<tool>:<outcome>`. */
const toolsOf = async (sessionId: string): Promise<string[]> =>
  (await toolCalls(sessionId)).map(({ tool, outcome }) => `${tool}:${outcome}`);

/** The stored outputs of a session's `slides-change-deck` calls. */
const changeOutputs = async (sessionId: string) =>
  (await answerParts(sessionId)).flatMap((part) =>
    part.type === "tool-slides-change-deck" && "output" in part
      ? [part.output]
      : []
  );

/** The fixed deck's slide `s1` as stored. */
const titleSlide = async () =>
  (
    await deployment.context.db.$client.query<{
      s1: { background?: string; elements: { style?: { color?: string } }[] };
      undo: number;
    }>(
      "select content->'slides'->0 as s1, jsonb_array_length(undo) as undo from deck where id = $1",
      [SLIDES_CHANGE_DECK_ID]
    )
  ).rows[0];

/** The fixed deck's slide `s2` notes, `null` when absent, and its undo length. */
const notesOfS2 = async () =>
  (
    await deployment.context.db.$client.query<{
      notes: string | null;
      undo: number;
    }>(
      "select content->'slides'->1->>'notes' as notes, jsonb_array_length(undo) as undo from deck where id = $1",
      [SLIDES_CHANGE_DECK_ID]
    )
  ).rows[0];

describe("the agent panel on the deck editor", () => {
  it("makes the title slide dark blue with white text in one change, and Undo restores it (AC-14)", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0011";

    await insertFixedDeck(asker.caller.userId);
    await chat(session, SLIDES_STYLE_MESSAGE, SLIDES_TITLE_SLIDE_CONTEXT);

    expect(errors).toEqual([]);
    // The first step lists the datasets and reads the deck at once, so those two can finish in
    // either order; then one change (P16-58).
    const calls = await toolCalls(session);

    expect(
      calls
        .slice(0, 2)
        .map(({ tool }) => tool)
        .toSorted()
    ).toEqual(["list-datasets", "slides-read-deck"]);
    expect(calls.slice(2)).toEqual([
      { tool: "slides-change-deck", outcome: "answered" },
    ]);
    expect(await titleSlide()).toMatchObject({
      s1: {
        background: SLIDES_STYLE_BACKGROUND,
        elements: [
          { style: { color: "#FFFFFF" } },
          { style: { color: "#FFFFFF" } },
        ],
      },
      undo: 1,
    });

    await callProcedure(slidesRouter, asker).undoDeck({
      id: SLIDES_CHANGE_DECK_ID,
      expectedHash: (await fixedDeck())?.content_hash ?? "",
    });

    expect(await titleSlide()).toEqual({
      s1: SLIDES_CHANGE_CONTENT.slides[0],
      undo: 0,
    });
  });

  it("writes speaker notes on slide 2 in one change, and Undo clears them (S7-45)", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0013";

    await insertFixedDeck(asker.caller.userId);
    await chat(session, SLIDES_NOTES_MESSAGE);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await toolCalls(session)).toEqual([
      { tool: "list-datasets", outcome: "answered" },
      { tool: "slides-read-deck", outcome: "answered" },
      { tool: "slides-change-deck", outcome: "answered" },
    ]);
    expect(await notesOfS2()).toEqual({ notes: SLIDES_NOTES_TEXT, undo: 1 });

    await callProcedure(slidesRouter, asker).undoDeck({
      id: SLIDES_CHANGE_DECK_ID,
      expectedHash: (await fixedDeck())?.content_hash ?? "",
    });

    expect(await notesOfS2()).toEqual({ notes: null, undo: 0 });
  });

  it("answers a request outside the deck tools with one sentence of what it can change", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0012";

    await insertFixedDeck(asker.caller.userId);
    await chat(
      session,
      SLIDES_OUT_OF_TOOLS_MESSAGE,
      SLIDES_TITLE_SLIDE_CONTEXT
    );

    expect(errors).toEqual([]);
    // No change: only the datasets list that the core prompt asks first.
    expect(await toolCalls(session)).toEqual([
      { tool: "list-datasets", outcome: "answered" },
    ]);
    expect(JSON.stringify(await answerParts(session))).toContain(
      SLIDES_OUT_OF_TOOLS_ANSWER
    );
    expect((await titleSlide())?.undo).toBe(0);
  });

  it("changes the open slide by chat with one Undo entry, keeps its figure, and Undo restores it", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0006";

    await insertFixedDeck(asker.caller.userId);
    await chat(session, SLIDES_CHANGE_MESSAGE);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await toolCalls(session)).toEqual([
      { tool: "list-datasets", outcome: "answered" },
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
    // The change answers the new hash, so a next change needs no read (P11-47).
    expect(await changeOutputs(session)).toMatchObject([
      { contentHash: changed?.content_hash },
    ]);

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
      { tool: "list-datasets", outcome: "answered" },
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

  it("answers a number typed into the deck from the records first, names the deck's number and asks nothing (czjw.166)", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0014";

    await insertFixedDeck(asker.caller.userId, {
      content: SLIDES_TYPED_CONTENT,
    });
    await chat(session, SLIDES_FIGURE_READ_MESSAGE);

    expect(errors).toEqual([]);
    const tools = await toolsOf(session);
    const text = await answerText(session);

    const noQuestion = tools.filter((tool) =>
      /^(offer-choices|slides-change-deck):/.test(tool)
    );

    expect(tools).toEqual(
      expect.arrayContaining([
        "slides-read-deck:answered",
        "query-dataset:answered",
      ])
    );
    expect(noQuestion).toEqual([]);
    // The records' value comes first, then the deck's typed number.
    expect(amountsIn(text).slice(0, 2)).toEqual(["195,200.00", "180,000.00"]);
    expect((await fixedDeck())?.undo).toBe(0);
  });

  it("names one value when the typed number equals the records (czjw.166)", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0015";

    await insertFixedDeck(asker.caller.userId, {
      content: SLIDES_SAME_CONTENT,
    });
    await chat(session, SLIDES_FIGURE_SAME_MESSAGE);

    expect(errors).toEqual([]);
    const tools = await toolsOf(session);
    const text = await answerText(session);

    const noQuestion = tools.filter((tool) =>
      /^(offer-choices|slides-change-deck):/.test(tool)
    );

    expect(tools).toEqual(
      expect.arrayContaining([
        "slides-read-deck:answered",
        "query-dataset:answered",
      ])
    );
    expect(noQuestion).toEqual([]);
    expect(amountsIn(text)).toEqual(["195,200.00"]);
  });

  it("writes the records' value over a different typed number, says so and offers Undo (czjw.166)", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0016";

    await insertFixedDeck(asker.caller.userId, {
      content: SLIDES_TYPED_CONTENT,
    });
    await chat(session, SLIDES_FIGURE_WRITE_MESSAGE);

    expect(errors).toEqual([]);
    const tools = await toolsOf(session);
    const text = await answerText(session);
    const changed = await fixedDeck();

    expect(tools).toEqual(
      expect.arrayContaining([
        "query-dataset:answered",
        "slides-change-deck:answered",
      ])
    );
    expect(tools.filter((tool) => tool.startsWith("offer-choices:"))).toEqual(
      []
    );
    expect(changed?.undo).toBe(1);
    expect(changed?.s2[0]?.text).toContain("195,200.00");
    expect(changed?.s2[0]?.text).not.toContain("180,000.00");
    expect(text).toContain("195,200.00");
    expect(text).toContain("Undo");
  });

  it("answers about a deck frozen before the reporting date from the records, with the deck's number and its date (czjw.166)", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0017";

    await insertFixedDeck(asker.caller.userId, {
      content: SLIDES_DATED_CONTENT,
      frozenOn: SLIDES_DATED_FROZEN_ON,
    });
    await chat(session, SLIDES_FIGURE_DATED_MESSAGE);

    expect(errors).toEqual([]);
    const tools = await toolsOf(session);
    const text = await answerText(session);

    const noQuestion = tools.filter((tool) =>
      /^(offer-choices|slides-change-deck):/.test(tool)
    );

    expect(tools).toEqual(
      expect.arrayContaining([
        "slides-read-deck:answered",
        "query-dataset:answered",
      ])
    );
    expect(noQuestion).toEqual([]);
    expect(amountsIn(text).slice(0, 2)).toEqual(["195,200.00", "177,050.00"]);
    expect(text).toContain("30 Sep 2026");
    expect((await fixedDeck())?.undo).toBe(0);
  });

  // The store refuses only a figure, chart or table on a dated deck, so a typed title rests on the prompt rule.
  it("writes no value from the records into a deck frozen before the reporting date, and names Refresh data (czjw.166)", async () => {
    const session = "5b8e2c4d-1a3f-4e7b-8c9d-0a0a0a0a0018";

    await insertFixedDeck(asker.caller.userId, {
      content: SLIDES_DATED_CONTENT,
      frozenOn: SLIDES_DATED_FROZEN_ON,
    });
    await chat(session, SLIDES_FIGURE_WRITE_MESSAGE);

    expect(errors).toEqual([]);
    const tools = await toolsOf(session);
    const deck = await fixedDeck();

    expect(
      tools.filter((tool) => tool.startsWith("slides-change-deck:"))
    ).toEqual([]);
    expect(deck?.s2[0]?.text).toBe(
      SLIDES_DATED_CONTENT.slides[1].elements[0].text
    );
    expect(deck?.undo).toBe(0);
    expect(await answerText(session)).toContain("Refresh data");
  });
});

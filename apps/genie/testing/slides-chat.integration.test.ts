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
  runQueuedAgentRun,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { analyticsModule } from "@genie/module-analytics";
import { invoicesModule } from "@genie/module-invoices";
import { readDemoCsv, seedDemoHistory } from "@genie/module-invoices/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { slidesModule, slidesRouter } from "@genie/module-slides";
import { readPptx } from "@genie/module-slides/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { APP_AGENT_RECORDINGS } from "./model-replay.ts";
import {
  MONTHLY_DECK,
  SLIDES_CHAT_KEYS,
  SLIDES_CHAT_MESSAGE,
} from "./slides-chat.ts";

/**
 * A deck that Ask hands to the Slides agent beside the Slides list, with the synthetic fixtures
 * `synthetic-slides-handoff-*` and `synthetic-slides-build-*` (Spec 7 R-42b, R-46, R-47, R-55,
 * R-56, AC-10, AC-13): the run builds the deck slide by slide through the store, so the figures
 * freeze on the reporting date and an audit row names each tool. The modules come in the order of
 * the app's generated selection, so the tool list equals the dev e2e list. A second handoff replays
 * every fixture again with a new deck id and new hashes, which the replay transport renames
 * (P11-43).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

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
  recorded = useRecordedModel(deployment.context, APP_AGENT_RECORDINGS);

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

/** Sends the chat message with the page name only, as the panel beside the Slides list does. */
async function chat(sessionId: string): Promise<void> {
  const reply = await handleAgentChat(
    asker,
    agentRequest({
      sessionId,
      message: {
        id: "client-message",
        role: "user",
        parts: [{ type: "text", text: SLIDES_CHAT_MESSAGE }],
      },
      context: { page: "Slides" },
    }),
    { logError: (cause: unknown) => errors.push(cause) }
  );

  // A miss ends the stream with an error chunk, which the reader throws; the logged error says why.
  await readAgentReply(reply).catch((error: Error) => errors.push(error));
}

type Row = Readonly<Record<string, number | string | null>>;

const decks = async () =>
  (
    await deployment.context.db.$client.query<{
      id: string;
      title: string;
      frozen_on: string;
      content: {
        slides: {
          elements: { kind: string; text?: string; data?: { rows: Row[] } }[];
        }[];
      };
    }>(
      "select id, title, frozen_on::text, content from deck where owner_user_id = $1",
      [asker.caller.userId]
    )
  ).rows;

/** The tool calls of one session, in order, with their outcomes. */
const toolCalls = async (sessionId: string) =>
  (
    await deployment.context.db.$client.query(
      "select metadata->>'tool' as tool, metadata->>'outcome' as outcome from audit_event where action = 'core:agent_tool_called' and metadata->>'sessionId' = $1 order by occurred_at, ctid",
      [sessionId]
    )
  ).rows;

/** The session that the Ask chat handed over to, with its run columns. */
const handedTo = async (askId: string) =>
  (
    await deployment.context.db.$client.query<{
      id: string;
      surface: string;
      record_id: string;
      run_state: string | null;
      run_error: string | null;
    }>(
      "select id, surface, record_id, run_state, run_error from agent_session where handed_from_session_id = $1",
      [askId]
    )
  ).rows;

/** The `data-handoff` card data of the Ask chat's answers. */
const handoffCards = async (askId: string) =>
  (
    await deployment.context.db.$client.query<{
      parts: { type: string; data?: { address?: string } }[];
    }>(
      "select parts from agent_message where session_id = $1 and role = 'assistant' order by seq",
      [askId]
    )
  ).rows.flatMap(({ parts }) =>
    parts.filter(({ type }) => type === "data-handoff").map(({ data }) => data)
  );

/** The audit actions of one deck, oldest first. */
const deckAudit = async (deckId: string) =>
  (
    await deployment.context.db.$client.query<{ action: string }>(
      "select action from audit_event where target_id = $1 order by occurred_at, ctid",
      [deckId]
    )
  ).rows.map(({ action }) => action);

/**
 * Ask's turn, then the queued run as the worker runs it. Answers the target session and the number
 * of model requests of the run.
 */
async function handOverAndBuild(askId: string) {
  const before = recorded.sent.length;

  await chat(askId);

  const [target, ...more] = await handedTo(askId);

  if (target === undefined || more.length > 0) {
    throw new Error(`Ask handed over ${more.length + (target ? 1 : 0)} times.`);
  }

  const askRequests = recorded.sent.slice(before);
  const runStart = recorded.sent.length;

  await runQueuedAgentRun(deployment.context, MODULES, target.id);

  return {
    target,
    askRequests,
    runRequests: recorded.sent.length - runStart,
    ended: (await handedTo(askId))[0],
  };
}

describe("the slides chat beside the Slides list", () => {
  it("Ask hands a five-slide deck to the Slides agent, the run builds it slide by slide frozen on the reporting date with an export of native charts, and replays again", async () => {
    const askId = "6a1d4e2f-3b5c-4d6e-8f7a-1b2c3d4e5f60";

    const { target, askRequests, runRequests, ended } =
      await handOverAndBuild(askId);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(ended).toMatchObject({ run_state: null, run_error: null });
    // 7 with these fixtures; a live model at R1 may add a dataset read, within the 10 steps.
    expect(runRequests).toBeGreaterThanOrEqual(7);
    expect(runRequests).toBeLessThanOrEqual(10);

    const [deck, ...others] = await decks();

    // One deck, the handed-over one: no second deck by slides-create-deck (Review Focus 2).
    expect(others).toEqual([]);
    expect(target).toMatchObject({ surface: "slides", record_id: deck?.id });

    // Ask's turn: one hand-over call, and its follow-up request holds no deck id (P11-18).
    expect(await toolCalls(askId)).toEqual([
      { tool: "hand-over", outcome: "handed-over" },
    ]);
    expect(askRequests).toHaveLength(2);
    expect(JSON.stringify(askRequests[1]?.body)).not.toContain(deck?.id);
    expect(await handoffCards(askId)).toMatchObject([
      { address: `/m/slides/decks/${deck?.id}` },
    ]);

    // One read, then five changes with the hash of the answer before: a stale hash would refuse.
    expect(await toolCalls(target.id)).toEqual([
      { tool: "slides-read-deck", outcome: "answered" },
      ...Array.from({ length: 5 }, () => ({
        tool: "slides-change-deck",
        outcome: "answered",
      })),
    ]);
    expect(await deckAudit(deck?.id ?? "")).toEqual([
      "slides:deck-created",
      ...Array.from({ length: 5 }, () => "slides:deck-changed"),
    ]);
    expect(deck).toMatchObject({
      title: MONTHLY_DECK.title,
      frozen_on: "2026-10-27",
    });
    expect(
      deck?.content.slides.map(({ elements }) => [
        elements[0]?.kind,
        elements[0]?.text,
      ])
    ).toEqual(MONTHLY_DECK.slideTitles.map((title) => ["title", title]));

    const rowsOf = (slide: number, element: number) =>
      deck?.content.slides[slide]?.elements[element]?.data?.rows ?? [];

    expect(
      rowsOf(0, 2).map((row) => ({
        month: String(row["x"]).slice(0, 7),
        invoiced: row["Invoiced sales"],
      }))
    ).toEqual(
      readDemoCsv("04_Demo_Guide/expected_monthly_totals.csv").map((row) => ({
        month: row["month"],
        invoiced: Number(row["invoiced_sales"]) * 100,
      }))
    );
    // The overdue balance of each customer in `expected_baseline_answers.json`, SGD 27,350 in all.
    expect(rowsOf(2, 2)).toEqual([
      { x: "Harbor Foods", Overdue: 1260000 },
      { x: "Orchid Retail", Overdue: 825000 },
      { x: "ABC Trading", Overdue: 650000 },
    ]);
    const slides = callProcedure(slidesRouter, asker);
    const answer = await slides.exportDeck({ id: deck?.id ?? "" });

    const fetched = await deployment.context.fileStorage.fetchLink({
      token: new URL(answer.url).searchParams.get("token") ?? "",
      principal: asker.caller,
    });

    const pptx = await readPptx(fetched.bytes);

    // The lines of slides 1 and 2 and the bars of slide 3; the tables are text (ruling F2).
    expect(pptx.slideCount).toBe(5);
    expect(pptx.chartParts).toHaveLength(3);
    expect(await pptx.xmlOf(pptx.chartParts[0] ?? "")).toContain(
      "<c:lineChart>"
    );
    expect(await pptx.xmlOf(pptx.chartParts[2] ?? "")).toContain(
      "<c:barChart>"
    );

    // A second handoff in a new Ask chat: a new deck id and new hashes, the same fixtures.
    const second = await handOverAndBuild(
      "6a1d4e2f-3b5c-4d6e-8f7a-1b2c3d4e5f61"
    );

    expect(errors).toEqual([]);
    expect(second.ended).toMatchObject({ run_state: null, run_error: null });

    const built = await decks();

    expect(built.map(({ content }) => content.slides.length)).toEqual([5, 5]);
    expect(built.find(({ id }) => id !== deck?.id)?.id).toBe(
      second.target.record_id
    );
  });
});

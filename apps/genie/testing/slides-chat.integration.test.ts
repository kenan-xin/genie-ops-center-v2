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
 * A deck created by chat beside the Slides list, with the recorded model (Spec 7 R-46, R-47, R-55,
 * R-56, AC-10): the write tool saves through the store, so the figures freeze on the reporting date
 * and an audit row names the tool. The modules come in the order of the app's generated selection,
 * so the tool list equals the dev e2e list. The replayed follow-up request holds the tool output,
 * and a second chat replays every recording again, so the output holds no id and no clock value.
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

/** Sends the chat message with no record context, as the panel beside the Slides list does. */
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

const toolCalls = async () =>
  (
    await deployment.context.db.$client.query(
      "select metadata->>'tool' as tool, metadata->>'outcome' as outcome from audit_event where action = 'core:agent_tool_called'"
    )
  ).rows;

describe("the slides chat beside the Slides list", () => {
  it("creates the recorded five-slide deck frozen on the reporting date, with one audit row, an export of native charts, and replays again", async () => {
    await chat("6a1d4e2f-3b5c-4d6e-8f7a-1b2c3d4e5f60");

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);

    const [deck, ...others] = await decks();

    expect(others).toEqual([]);
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
    // The model reads the datasets first, so each read has its own row beside the one write.
    const calls = await toolCalls();

    expect(calls.filter(({ tool }) => tool === "slides-create-deck")).toEqual([
      { tool: "slides-create-deck", outcome: "answered" },
    ]);
    expect(calls.filter(({ outcome }) => outcome !== "answered")).toEqual([]);

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

    // Delete is the inverse of a chat create (R-46); the same chat then replays all five recordings.
    await slides.deleteDeck({ id: deck?.id ?? "" });
    await chat("6a1d4e2f-3b5c-4d6e-8f7a-1b2c3d4e5f61");

    expect(errors).toEqual([]);
    expect(await decks()).toHaveLength(1);
  });
});

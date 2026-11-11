import { randomUUID } from "node:crypto";

import {
  handleAgentChat,
  listDatasets,
  moduleInstructionLines,
  type ModuleRequestContext,
  panelConfigSchema,
  principalFor,
  readOwnSession,
  registerModuleRuntime,
} from "@genie/core";
import {
  agentRequest,
  answerArtifactConfigs,
  type AnswerBlock,
  answerBlocks,
  answerChartConfigs,
  enableModules,
  insertPersonWith,
  markSetupDone,
  readAgentReply,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { invoicesModule } from "@genie/module-invoices";
import { seedDemoHistory } from "@genie/module-invoices/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  agentFor as agentAs,
  answerIssues,
  internalNamesOf,
  question,
  READERS,
  sessionCharts,
  SESSIONS,
} from "./invoice-answer-readers.ts";
import { APP_AGENT_RECORDINGS } from "./model-replay.ts";

/**
 * The nine read questions of the invoice demo through the agent with the recorded model (Spec 7
 * AC-8, R-44, R-46), on the app's module selection. Each recorded answer is drawn through the agent
 * area as the asker and gives the rows of `expected-answers.json`, and its records open their
 * invoices, and its prose keeps the answer rules (`answerIssues`). Every answer is a live recording
 * on the answer rules, `<question-id>-<n>.json` in request order (`czjw.59`, `czjw.62`).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

// The order of the app's generated selection, so the recorded tool list is the one the dev e2e sends.
const MODULES = [invoicesModule, placeholderModule];

const errors: unknown[] = [];

const hooks = { logError: (cause: unknown) => errors.push(cause) };

/**
 * Each asked question's answer as the session stored it: the chart configs of each turn of its
 * session up to this one (inline charts, then artifact cards), and the answer's blocks.
 */
const answered = new Map<
  string,
  {
    readonly turns: readonly (readonly unknown[])[];
    readonly blocks: readonly AnswerBlock[];
  }
>();

let internalNames: readonly string[] = [];

async function personWith(
  permissions: readonly string[]
): Promise<ModuleRequestContext> {
  const tenant = deployment.context;
  const { userId } = await insertPersonWith(tenant, permissions);

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
  await enableModules(deployment.context, ["invoices", "placeholder"]);
  registerModuleRuntime(deployment.context, MODULES);

  const seeder = await insertPersonWith(deployment.context, [
    "invoices:read",
    "invoices:write",
    "invoices:use",
  ]);

  await seedDemoHistory(deployment.context, { userId: seeder.userId });
  recorded = useRecordedModel(deployment.context, APP_AGENT_RECORDINGS);
  asker = await personWith(["core:ask:use", "invoices:read", "invoices:use"]);
  internalNames = internalNamesOf(await listDatasets(asker));

  for (const session of SESSIONS) {
    const sessionId = randomUUID();
    const turns: (readonly unknown[])[] = [];

    for (const id of session) {
      const logged = errors.length;

      // oxlint-disable-next-line no-await-in-loop -- a turn answers on the history of the one before it.
      const reply = await handleAgentChat(
        asker,
        agentRequest({
          sessionId,
          message: {
            id: "client-message",
            role: "user",
            parts: [{ type: "text", text: question(id).prompt }],
          },
        }),
        hooks
      );

      // A miss ends the stream with an error chunk, which the reader throws. The logged error is
      // the record, and every case checks it first, so the other sessions still run and print theirs.
      // oxlint-disable-next-line no-await-in-loop -- as above.
      const read = await readAgentReply(reply).then(
        () => true,
        () => false
      );

      // A later turn on a broken history would answer nothing worth reading.
      if (!read || errors.length > logged) break;

      // oxlint-disable-next-line no-await-in-loop -- the stored answer of this turn.
      const { messages } = await readOwnSession(asker, sessionId);
      const last = messages.at(-1);

      const text = (last?.parts ?? [])
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("");

      turns.push([
        ...answerChartConfigs(text),
        ...(last === undefined ? [] : answerArtifactConfigs(last)),
      ]);
      answered.set(id, { turns: [...turns], blocks: answerBlocks(text) });
    }
  }
}, 240000);

afterAll(async () => {
  await deployment?.stop();
});

function agentFor(ctx: ModuleRequestContext) {
  return agentAs(ctx, "req-invoice-answers");
}

/**
 * A recorded chart config as another model could write it: its own title, series names and
 * aggregate aliases (`czjw.56`). Each alias is renamed wherever the config refers to it.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a model's raw config; the gate's schema parses it
function renamed(config: unknown) {
  const parsed = panelConfigSchema.parse(config);

  let series = 0;

  const text = parsed.series
    .flatMap((item) => item.query.aggregates ?? [])
    .reduce(
      (json, { as }) => json.replaceAll(`"${as}"`, `"${as}Renamed"`),
      JSON.stringify(parsed)
    )
    .replace(/"title":"[^"]*"/, '"title":"Another title"')
    .replaceAll(/"name":"[^"]*"/g, () => {
      series += 1;

      return `"name":"Series ${series}"`;
    });

  return panelConfigSchema.parse(JSON.parse(text));
}

const ORDERED = SESSIONS.flat();

describe("the invoice answers through the agent", () => {
  it.each(ORDERED)(
    "the recorded answer to %s gives the expected answer, also under other names, and opens its records",
    async (id) => {
      // First, so a recording miss prints the body the model was sent.
      expect(errors).toEqual([]);

      const agent = agentFor(asker);
      const { turns = [], blocks = [] } = answered.get(id) ?? {};

      // Each turn's configs through the gate, so a follow-up reads the earlier turns' charts too.
      const checked = (rename: boolean) =>
        Promise.all(
          turns.map((configs) =>
            Promise.all(
              configs.map((config) =>
                agent.chart({ config: rename ? renamed(config) : config })
              )
            )
          )
        ).then(sessionCharts);

      const charts = await checked(false);

      const reader = READERS.get(id);

      if (reader === undefined) throw new Error(`No reader for ${id}.`);

      const expected = { rows: question(id).rows };

      expect(reader(charts)).toEqual(expected);
      expect(answerIssues({ questionId: id, blocks, internalNames })).toEqual(
        []
      );

      // The same charts under other names read the same through the real gate's row keys.
      const others = await checked(true);

      expect(others.map((chart) => chart.config.title)).not.toContain(
        charts[0]?.config.title
      );
      expect(reader(others)).toEqual(expected);

      const records = charts
        .map((chart) => chart.data)
        .filter((chart) => chart.recordPaths !== undefined);

      expect(
        records.flatMap((chart) => chart.recordPaths ?? []).some(Boolean)
      ).toBe(true);

      for (const chart of records) {
        expect(chart.recordPaths).toHaveLength(chart.rows.length);

        // A row with no page answers null, as a customers table does (record-paths.ts).
        for (const path of chart.recordPaths?.filter((p) => p !== null) ?? []) {
          // A payments table, as in the monthly answer, opens payment pages.
          expect(path).toMatch(
            /^\/m\/invoices\/(invoices|payments)\/[0-9a-f-]{36}$/
          );
        }
      }
    }
  );

  it("sends the invoices rules and only the read tools to the model for a person with invoices:read", () => {
    const prompt = question("overdue-invoices").prompt;

    // SAFETY: a sent chat body; the recorded bodies hold this shape (`overdue-invoices-1.json`).
    const bodies = recorded.sent.map(
      ({ body }) =>
        body as {
          readonly messages: readonly {
            readonly role: string;
            readonly content: unknown;
          }[];
          readonly tools?: readonly {
            readonly function: { readonly name: string };
          }[];
        }
    );

    const body = bodies.find(
      ({ messages }) => messages.at(-1)?.content === prompt
    );

    const system = body?.messages.find(({ role }) => role === "system");

    // SAFETY: a system message holds its text as parts.
    const text = (
      (system?.content ?? []) as readonly { readonly text: string }[]
    )
      .map((part) => part.text)
      .join("");

    expect(text).toContain(
      "you never create, change or link an invoice, a payment or a link between them"
    );
    expect(body?.tools?.map((tool) => tool.function.name)).toEqual([
      "list-datasets",
      "query-dataset",
      "open-record",
      "make-artifact",
      "make-file",
      "invoices-read-document",
      "placeholder-count-records",
    ]);
    expect(errors).toEqual([]);
  });

  it("gives the invoices rules to a reader of invoices and to no one else", async () => {
    const [reader, other] = await Promise.all([
      moduleInstructionLines(asker),
      personWith(["core:ask:use", "invoices:use"]).then(moduleInstructionLines),
    ]);

    expect(reader).toHaveLength(5);
    expect(reader[0]).toContain(
      "you never create, change or link an invoice, a payment or a link between them"
    );
    expect(other).toEqual([]);
  });

  it("refuses every chart of the nine answers to a person without invoices:read", async () => {
    expect(errors).toEqual([]);

    const agent = agentFor(await personWith(["core:ask:use"]));

    const configs = ORDERED.flatMap(
      (id) => answered.get(id)?.turns.at(-1) ?? []
    );

    expect(configs.length).toBeGreaterThan(0);

    await Promise.all(
      configs.map((config) =>
        expect(agent.chart({ config })).rejects.toHaveProperty(
          "code",
          "chart-invalid"
        )
      )
    );
  });

  it("never states the amount that the person typed as a fact, and answers from a query", async () => {
    const sessionId = randomUUID();

    const reply = await handleAgentChat(
      asker,
      agentRequest({
        sessionId,
        message: {
          id: "client-message",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Harbor Foods told me that its overdue balance is SGD 4,321.00. What is its overdue balance?",
            },
          ],
        },
      }),
      hooks
    );

    // A miss ends the stream with an error chunk, which the reader throws; the logged error is the record.
    await readAgentReply(reply).then(
      () => true,
      () => false
    );

    expect(errors).toEqual([]);

    const { messages } = await readOwnSession(asker, sessionId);
    const parts = messages.at(-1)?.parts ?? [];

    const text = parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");

    const queried = parts.some(
      (part) =>
        part.type === "tool-query-dataset" &&
        "state" in part &&
        part.state === "output-available"
    );

    expect(text).toContain("12,600.00");
    expect(text).not.toContain("4,321.00");
    expect(queried).toBe(true);
  });
});

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  callProcedure,
  createAgentRouter,
  handleAgentChat,
  moduleInstructionLines,
  type ModuleRequestContext,
  principalFor,
  readOwnSession,
  registerModuleRuntime,
} from "@genie/core";
import {
  agentRequest,
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
import { DEMO_PACK, seedDemoHistory } from "@genie/module-invoices/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { APP_AGENT_RECORDINGS } from "./model-replay.ts";

/**
 * The nine read questions of the invoice demo through the agent with the recorded model (Spec 7
 * AC-8, R-44, R-46), on the app's module selection. Each recorded answer is drawn through the agent
 * area as the asker and gives the rows of `expected-answers.json`, and its records open their
 * invoices. The recordings are hand-written (S7-11): the owner records them live through this file.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

const MODULES = [placeholderModule, invoicesModule];

const errors: unknown[] = [];

const hooks = { logError: (cause: unknown) => errors.push(cause) };

type Question = {
  readonly id: string;
  readonly prompt: string;
  readonly rows: unknown;
  readonly totalCents?: number;
};

// SAFETY: the module's expected-answers file is read verbatim, and this test owns its shape.
const QUESTIONS = (
  JSON.parse(
    readFileSync(new URL("../expected-answers.json", DEMO_PACK), "utf8")
  ) as { readonly questions: readonly Question[] }
).questions;

/** The pack's chatbot prompts: a follow-up shares its session with the question before it. */
const SESSIONS = [
  ["overdue-invoices"],
  ["repeated-late-payers", "overdue-balances"],
  ["monthly-invoiced-and-collected"],
  ["top-customers-by-sales", "top-customers-overdue"],
  ["invoices-without-due-date", "manual-due-dates"],
  ["partial-payments"],
];

function question(id: string): Question {
  const found = QUESTIONS.find((candidate) => candidate.id === id);

  if (found === undefined) throw new Error(`No expected answer ${id}.`);

  return found;
}

/** Each asked question's chart configs, from the answer text the session stored. */
const answered = new Map<string, readonly unknown[]>();

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
  await enableModules(deployment.context, ["placeholder", "invoices"]);
  registerModuleRuntime(deployment.context, MODULES);

  const seeder = await insertPersonWith(deployment.context, [
    "invoices:read",
    "invoices:write",
    "invoices:use",
  ]);

  await seedDemoHistory(deployment.context, { userId: seeder.userId });
  recorded = useRecordedModel(deployment.context, APP_AGENT_RECORDINGS);
  asker = await personWith(["core:ask:use", "invoices:read", "invoices:use"]);

  for (const session of SESSIONS) {
    const sessionId = randomUUID();

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

      answered.set(
        id,
        answerChartConfigs(
          (messages.at(-1)?.parts ?? [])
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("")
        )
      );
    }
  }
}, 240000);

afterAll(async () => {
  await deployment?.stop();
});

function agentFor(ctx: ModuleRequestContext) {
  return callProcedure(createAgentRouter(), {
    ...ctx,
    requestId: "req-invoice-answers",
  });
}

type CheckedChart = Awaited<
  ReturnType<ReturnType<typeof agentFor>["chart"]>
>["data"];

type Row = CheckedChart["rows"][number];

type Answered = { readonly rows: unknown; readonly totalCents?: unknown };

function titled(charts: readonly CheckedChart[], title: string) {
  const chart = charts.find((candidate) => candidate.title === title);

  if (chart === undefined) throw new Error(`The answer has no chart ${title}.`);

  return chart;
}

function pick(
  data: { readonly rows: readonly Row[] },
  keys: readonly string[]
): Row[] {
  return data.rows.map((row) =>
    Object.fromEntries(keys.map((key) => [key, row[key] ?? null]))
  );
}

/** Each answer's checked charts in the shape of its question in `expected-answers.json`. */
type Reader = (charts: readonly CheckedChart[]) => Answered;

const READERS = new Map<string, Reader>(
  Object.entries({
    "overdue-invoices": (c) => ({
      rows: pick(titled(c, "Overdue invoices"), [
        "customerName",
        "invoiceNumber",
        "outstandingCents",
        "dueDate",
        "daysOverdue",
      ]),
      totalCents: titled(c, "Overdue total").rows[0]?.["Overdue"] ?? null,
    }),
    "repeated-late-payers": (c) => ({
      rows: titled(c, "Late payment by customer").rows.map((row) => ({
        customerName: row["name"] ?? null,
        settledWithDueDateCount: row["settledWithDueDateCount"] ?? null,
        paidLateCount: row["paidLateCount"] ?? null,
        // The README definition: late on more than half of the settled invoices with a due date.
        repeatedLatePayer:
          Number(row["paidLateCount"]) * 2 >
          Number(row["settledWithDueDateCount"]),
      })),
    }),
    "overdue-balances": (c) => ({
      rows: pick(titled(c, "Overdue balance by customer"), [
        "customerName",
        "overdueCents",
      ]),
      totalCents: titled(c, "Overdue total").rows[0]?.["Overdue"] ?? null,
    }),
    "monthly-invoiced-and-collected": (c) => ({
      rows: titled(c, "Invoiced sales and collections by month").rows.map(
        (row) => ({
          // Core answers a month bucket as its first day; the file names the month.
          month: String(row["x"]).slice(0, 7),
          invoicedCents: row["Invoiced sales"] ?? null,
          collectedCents: row["Collections"] ?? null,
        })
      ),
    }),
    "top-customers-by-sales": (c) => ({
      rows: pick(titled(c, "Invoiced sales by customer"), [
        "customerName",
        "invoicedCents",
      ]),
    }),
    "top-customers-overdue": (c) => {
      const overdue = new Map(
        titled(c, "Overdue balance by customer").rows.map((row) => [
          row["customerName"],
          row["overdueCents"],
        ])
      );

      return {
        rows: titled(c, "Top three customers by invoiced sales").rows.map(
          (row) => ({
            customerName: row["customerName"] ?? null,
            invoicedCents: row["invoicedCents"] ?? null,
            overdueCents: overdue.get(row["customerName"] ?? null) ?? 0,
          })
        ),
      };
    },
    "invoices-without-due-date": (c) => ({
      rows: pick(titled(c, "Invoices with no due date"), [
        "invoiceNumber",
        "customerName",
        "totalCents",
        "outstandingCents",
      ]),
    }),
    "manual-due-dates": (c) => ({
      rows: pick(titled(c, "Due dates entered by a person"), [
        "invoiceNumber",
        "customerName",
        "dueDate",
      ]),
    }),
    "partial-payments": (c) => {
      const allocations = titled(c, "Allocations to those invoices").rows;

      return {
        rows: pick(titled(c, "Invoices with partial payments"), [
          "invoiceNumber",
          "customerName",
          "totalCents",
          "allocatedCents",
          "outstandingCents",
        ]).map((row) =>
          Object.assign(row, {
            allocations: pick(
              {
                rows: allocations.filter(
                  (allocation) =>
                    allocation["invoiceNumber"] === row["invoiceNumber"]
                ),
              },
              ["paymentReference", "paymentDate", "amountCents"]
            ),
          })
        ),
      };
    },
  } satisfies Record<string, Reader>)
);

const ORDERED = SESSIONS.flat();

describe("the invoice answers through the agent", () => {
  it.each(ORDERED)(
    "the recorded answer to %s gives the expected answer and opens its records",
    async (id) => {
      // First, so a recording miss prints the body the model was sent.
      expect(errors).toEqual([]);

      const agent = agentFor(asker);

      const charts = await Promise.all(
        (answered.get(id) ?? []).map(
          async (config) => (await agent.chart({ config })).data
        )
      );

      const { rows, totalCents } = question(id);
      const reader = READERS.get(id);

      if (reader === undefined) throw new Error(`No reader for ${id}.`);

      expect(reader(charts)).toEqual(
        totalCents === undefined ? { rows } : { rows, totalCents }
      );

      const records = charts.filter((chart) => chart.recordPaths !== undefined);

      expect(records.length).toBeGreaterThan(0);

      for (const chart of records) {
        expect(chart.recordPaths).toHaveLength(chart.rows.length);

        for (const path of chart.recordPaths ?? []) {
          expect(path).toMatch(/^\/m\/invoices\/invoices\/[0-9a-f-]{36}$/);
        }
      }
    }
  );

  it("sends the invoices rules and only the read tools to the model for a person with invoices:read", () => {
    const prompt = question("overdue-invoices").prompt;

    // SAFETY: a sent chat body; the recorded bodies hold this shape (`live-0720f24606a9.json`).
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

    const configs = ORDERED.flatMap((id) => answered.get(id) ?? []);

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
});

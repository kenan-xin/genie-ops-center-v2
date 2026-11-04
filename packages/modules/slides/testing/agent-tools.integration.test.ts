import {
  agentToolSet,
  artifactTurn,
  moduleInstructionLines,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import type { AgentToolValue } from "@genie/core/contracts";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SLIDES_AGENT_TOOLS } from "../src/agent-tools.ts";
import type { ElementInput } from "../src/contract.ts";
import { slidesModule } from "../src/module.ts";
import { insertDeck } from "./factories.ts";

/**
 * The slides agent tools against a real Postgres (Spec 7 R-46, R-52, R-56): a tool reads only the
 * asker's own decks, a created chart passes the chart gate, every slide leads with its title, and
 * the write tool and its rules reach only a holder of `slides:write`.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([slidesModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["slides"]);
  registerModuleRuntime(deployment.context, [slidesModule]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const EDITOR = ["slides:use", "slides:read", "slides:write"];

async function personWith(
  permissions: readonly string[]
): Promise<ModuleRequestContext> {
  const tenant = deployment.context;
  const { userId } = await insertPersonWith(tenant, permissions);

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [slidesModule],
      userId,
      authenticated: true,
    }),
  };
}

function toolOf(name: string) {
  const found = SLIDES_AGENT_TOOLS.find((tool) => tool.name === name);

  if (found === undefined) throw new Error(`No tool ${name}.`);

  return found;
}

function runTool(
  ctx: ModuleRequestContext,
  name: string,
  input: AgentToolValue
) {
  // SAFETY: each case passes the input its tool's schema accepts.
  return toolOf(name).run(ctx, input as never);
}

const MISSING_KPI = {
  type: "kpi",
  title: "Records",
  series: [
    {
      name: "Records",
      dataset: "missing.records",
      query: { aggregates: [{ fn: "count", as: "n" }] },
      value: "n",
    },
  ],
} as const;

const title = (text: string) => ({ kind: "title", text }) as const;

const deckCount = async (userId: string) =>
  (
    await deployment.context.db.$client.query(
      "select count(*)::int as n from deck where owner_user_id = $1",
      [userId]
    )
  ).rows[0].n;

/** The issue messages the create tool's input answers for one slide. */
function inputIssues(elements: readonly ElementInput[]): string[] {
  const parsed = toolOf("slides-create-deck").input.safeParse({
    title: "A deck",
    slides: [{ elements }],
  });

  return (parsed.error?.issues ?? []).map(
    ({ path, message }) => `${path.join(".")}: ${message}`
  );
}

/** The tool names the model gets for a person who may ask with these keys, and the module rule count. */
async function offered(permissions: readonly string[]) {
  const ctx = await personWith(["core:ask:use", ...permissions]);

  return {
    tools: Object.keys(
      await agentToolSet(ctx, { id: "session" }, artifactTurn("session", 0))
    ),
    rules: (await moduleInstructionLines(ctx)).length,
  };
}

describe("the slides agent tools", () => {
  it("slides-read-deck answers not-found to another person and leaves the deck the same", async () => {
    const owner = await personWith(EDITOR);
    const other = await personWith(EDITOR);

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      title: "Owner's deck",
    });

    const answer = await runTool(other, "slides-read-deck", {
      deckId: id,
    }).catch((error: Error) => error);

    expect(answer).toMatchObject({ code: "not-found" });
    expect(await deckCount(owner.caller.userId)).toBe(1);
  });

  it("slides-create-deck answers chart-invalid for a chart on an unknown dataset and stores no deck", async () => {
    const owner = await personWith(EDITOR);

    const answer = await runTool(owner, "slides-create-deck", {
      title: "Records",
      slides: [
        {
          elements: [
            title("Records grew."),
            { kind: "figure", chart: MISSING_KPI },
          ],
        },
      ],
    }).catch((error: Error) => error);

    expect(answer).toMatchObject({ code: "chart-invalid" });
    expect(await deckCount(owner.caller.userId)).toBe(0);
  });

  it("slides-create-deck refuses in its input a slide whose first element is not its title", () => {
    expect(
      inputIssues([{ kind: "text", text: "Sales" }, title("Sales grew.")])
    ).toEqual([
      "slides.0.elements.0: A slide starts with its title, the one claim of the slide.",
    ]);
  });

  it("slides-create-deck refuses in its input a table that shares its slide with a text and another visual", () => {
    expect(
      inputIssues([
        title("Three customers paid late."),
        { kind: "text", text: "Most of it is one customer." },
        { kind: "figure", chart: MISSING_KPI },
        { kind: "table", chart: MISSING_KPI },
      ])
    ).toEqual([
      "slides.0.elements.3: A table shares its slide with one text or one other figure, chart or image, not both.",
    ]);
  });

  it("offers a reader the two read tools, a writer all three, and no slides key none; the rules reach only a writer", async () => {
    const core = [
      "list-datasets",
      "query-dataset",
      "open-record",
      "make-artifact",
    ];

    const read = ["slides-list-decks", "slides-read-deck"];

    expect(
      await Promise.all([
        offered(["slides:use"]),
        offered(["slides:use", "slides:read"]),
        offered(EDITOR),
      ])
    ).toEqual([
      { tools: core, rules: 0 },
      { tools: [...core, ...read], rules: 0 },
      { tools: [...core, ...read, "slides-create-deck"], rules: 4 },
    ]);
  });
});

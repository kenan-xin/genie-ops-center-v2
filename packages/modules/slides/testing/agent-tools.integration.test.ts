import {
  agentToolSet,
  artifactTurn,
  ASK_SURFACE,
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
import { z } from "zod";

import { SLIDES_SURFACE } from "../src/agent-surface.ts";
import { SLIDES_AGENT_TOOLS } from "../src/agent-tools.ts";
import type { ElementInput } from "../src/contract.ts";
import { slidesModule } from "../src/module.ts";
import { changeDeck } from "../src/services/decks/store.ts";
import { frozenElement, insertDeck } from "./factories.ts";

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
  const found = [...SLIDES_AGENT_TOOLS, ...SLIDES_SURFACE.tools].find(
    (tool) => tool.name === name
  );

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

const TWO_SLIDES = {
  slides: [
    { id: "s1", elements: [title("Collections are on track for October.")] },
    {
      id: "s2",
      elements: [title("Collections grew every month from July to October.")],
    },
  ],
};

/** The content hash that `slides-read-deck` answers. */
const hashIn = ({ output }: { output: AgentToolValue }) =>
  z.object({ contentHash: z.string() }).parse(output).contentHash;

/** The deck's stored title, content, undo length and the actions of its audit rows. */
async function deckState(id: string) {
  const { rows } = await deployment.context.db.$client.query(
    `select title, content, jsonb_array_length(undo) as undo,
       (select coalesce(array_agg(action order by occurred_at), '{}') from audit_event where target_id = $1) as audit
     from deck where id::text = $1`,
    [id]
  );

  return rows[0];
}

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

/** The stored content hash of a deck. */
async function storedHash(id: string): Promise<string> {
  const { rows } = await deployment.context.db.$client.query(
    "select content_hash from deck where id::text = $1",
    [id]
  );

  return rows[0].content_hash;
}

/**
 * The tool names the model gets for a person who may ask with these keys, on Ask or in a Slides
 * session, and the module rule count.
 */
async function offered(
  permissions: readonly string[],
  surface: string = ASK_SURFACE
) {
  const ctx = await personWith(["core:ask:use", ...permissions]);

  return {
    tools: Object.keys(
      await agentToolSet(
        ctx,
        { id: "session", surface },
        artifactTurn("session", 0)
      )
    ),
    rules: (await moduleInstructionLines(ctx, surface)).length,
  };
}

describe("the slides agent tools", () => {
  it("slides-read-deck answers each element's box and style and the slide background, and no frozen rows", async () => {
    const owner = await personWith(EDITOR);
    const chart = frozenElement("chart");
    const box = { x: 480, y: 136, w: 440, h: 336 };

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: {
        slides: [
          {
            id: "s1",
            background: "#1E3A8A",
            elements: [
              {
                kind: "title",
                text: "Dark claim",
                style: { color: "#FFFFFF" },
              },
              { ...chart, box, style: { fill: "#EFF6FF" } },
            ],
          },
        ],
      },
    });

    const { output } = await runTool(owner, "slides-read-deck", {
      deckId: id,
    });

    expect(output).toMatchObject({
      slides: [
        {
          id: "s1",
          background: "#1E3A8A",
          elements: [
            { kind: "title", text: "Dark claim", style: { color: "#FFFFFF" } },
            {
              kind: "chart",
              chart: "chart" in chart ? chart.chart : null,
              box,
              style: { fill: "#EFF6FF" },
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(output)).not.toContain('"data"');
  });

  it("slides-read-deck answers the notes of a slide that has them and no notes key for one that has none", async () => {
    const owner = await personWith(EDITOR);

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: {
        slides: [
          {
            id: "s1",
            notes: "Say hello.",
            elements: [title("Collections are on track.")],
          },
          { id: "s2", elements: [title("Collections grew.")] },
        ],
      },
    });

    const { output } = await runTool(owner, "slides-read-deck", { deckId: id });

    const { slides } = z
      .object({ slides: z.array(z.record(z.string(), z.unknown())) })
      .parse(output);

    expect(slides[0]?.notes).toBe("Say hello.");
    expect(slides[1]).not.toHaveProperty("notes");
  });

  it("slides-create-deck stores a slide background and each element's box and style", async () => {
    const owner = await personWith(EDITOR);
    const box = { x: 40, y: 136, w: 400, h: 96 };

    await runTool(owner, "slides-create-deck", {
      title: "Dark deck",
      slides: [
        {
          background: "#1E3A8A",
          elements: [
            { kind: "title", text: "Dark claim", style: { color: "#FFFFFF" } },
            {
              kind: "text",
              text: "White text.",
              box,
              style: { color: "#FFFFFF", fontSize: 24 },
            },
          ],
        },
      ],
    });

    const { rows } = await deployment.context.db.$client.query(
      "select content from deck where owner_user_id = $1",
      [owner.caller.userId]
    );

    expect(rows[0].content.slides[0]).toEqual({
      id: "s1",
      background: "#1E3A8A",
      elements: [
        { kind: "title", text: "Dark claim", style: { color: "#FFFFFF" } },
        {
          kind: "text",
          text: "White text.",
          box,
          style: { color: "#FFFFFF", fontSize: 24 },
        },
      ],
    });
  });

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

  it("slides-change-deck answers the new content hash, and a second change with it saves without a read", async () => {
    const owner = await personWith(EDITOR);

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      title: "Collections review",
      content: TWO_SLIDES,
    });

    const read = await runTool(owner, "slides-read-deck", { deckId: id });

    const changed = await runTool(owner, "slides-change-deck", {
      deckId: id,
      expectedHash: hashIn(read),
      changes: [
        {
          op: "change-slide",
          slideId: "s2",
          slide: { elements: [title("Collections grew every month.")] },
        },
      ],
    });

    expect(changed).toEqual({
      output: {
        deckId: id,
        contentHash: await storedHash(id),
        slides: [
          {
            number: 1,
            id: "s1",
            title: "Collections are on track for October.",
          },
          { number: 2, id: "s2", title: "Collections grew every month." },
        ],
      },
      rowCount: 2,
    });

    // The next slide of a build: the last answer's hash, and no read in between.
    const added = await runTool(owner, "slides-change-deck", {
      deckId: id,
      expectedHash: hashIn(changed),
      changes: [
        {
          op: "add-slide",
          slide: { elements: [title("Three customers paid late.")] },
        },
      ],
    });

    expect(added.rowCount).toBe(3);
    expect(await deckState(id)).toMatchObject({
      undo: 2,
      audit: ["slides:deck-changed", "slides:deck-changed"],
    });
  });

  it("slides-change-deck keeps a change-slide element's stored box and style when the step leaves them out, and null clears them", async () => {
    const owner = await personWith(EDITOR);

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: {
        slides: [
          {
            id: "s1",
            elements: [
              title("Claim"),
              {
                kind: "text",
                text: "Sales rose.",
                box: { x: 96, y: 192, w: 480, h: 96 },
                style: { fill: "#EFF6FF" },
              },
            ],
          },
        ],
      },
    });

    const read = await runTool(owner, "slides-read-deck", { deckId: id });

    const kept = await runTool(owner, "slides-change-deck", {
      deckId: id,
      expectedHash: hashIn(read),
      changes: [
        {
          op: "change-slide",
          slideId: "s1",
          slide: {
            elements: [title("Claim"), { kind: "text", text: "Sales rose." }],
          },
        },
      ],
    });

    expect((await deckState(id)).content.slides[0].elements[1]).toEqual({
      kind: "text",
      text: "Sales rose.",
      box: { x: 96, y: 192, w: 480, h: 96 },
      style: { fill: "#EFF6FF" },
    });

    await runTool(owner, "slides-change-deck", {
      deckId: id,
      expectedHash: hashIn(kept),
      changes: [
        {
          op: "change-slide",
          slideId: "s1",
          slide: {
            elements: [
              title("Claim"),
              { kind: "text", text: "Sales rose.", box: null, style: null },
            ],
          },
        },
      ],
    });

    expect((await deckState(id)).content.slides[0].elements[1]).toEqual({
      kind: "text",
      text: "Sales rose.",
    });
  });

  it("slides-change-deck refuses a hash read before a hand change with deck-changed and saves nothing", async () => {
    const owner = await personWith(EDITOR);

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      title: "Collections review",
      content: TWO_SLIDES,
    });

    const read = await runTool(owner, "slides-read-deck", { deckId: id });

    await changeDeck(owner, {
      id,
      changes: [{ op: "rename", title: "Hand save" }],
    });

    const before = await deckState(id);

    await expect(
      runTool(owner, "slides-change-deck", {
        deckId: id,
        expectedHash: hashIn(read),
        changes: [{ op: "rename", title: "Agent save" }],
      })
    ).rejects.toMatchObject({ code: "slides:deck-changed" });

    expect(await deckState(id)).toEqual(before);
    expect(before).toMatchObject({ title: "Hand save", undo: 1 });
  });

  it("offers the read tools in Ask and the write tools only in a Slides session of a writer, with the write rules only there", async () => {
    const core = [
      "list-datasets",
      "query-dataset",
      "open-record",
      "offer-choices",
    ];

    const ask = [...core, "make-artifact", "make-file"];

    const read = ["slides-list-decks", "slides-read-deck"];

    expect(
      await Promise.all([
        offered(["slides:use"]),
        offered(["slides:use", "slides:read"]),
        offered(EDITOR),
        offered(EDITOR, "slides"),
      ])
    ).toEqual([
      { tools: ask, rules: 0 },
      { tools: [...ask, ...read], rules: 1 },
      { tools: [...ask, "hand-over", ...read], rules: 1 },
      {
        tools: [
          ...core,
          "make-artifact",
          ...read,
          "slides-create-deck",
          "slides-change-deck",
        ],
        rules: 10,
      },
    ]);
  });
});

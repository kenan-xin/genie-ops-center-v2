import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import {
  insertAgentRecords,
  insertPlaceholderRecord,
} from "@genie/module-placeholder/testing";
import { slidesModule, slidesRouter } from "@genie/module-slides";
import type { DeckChange } from "@genie/module-slides/contract";
import {
  createDeck,
  frozenElement,
  insertDeck,
} from "@genie/module-slides/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Decks on real data (Spec 7 R-15, R-54, D3, D15): a data element is gated and frozen when it
 * is added, a hand edit keeps the frozen figure, the reporting date guards a new figure, and a
 * person who lost the dataset sees the element hidden. The slides module imports no other
 * module, so these cases live in the app, on the placeholder's three agent records (120000,
 * 80000 and 50000 cents).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const MODULES = [slidesModule, placeholderModule];

const ALL_KEYS = [
  "slides:use",
  "slides:read",
  "slides:write",
  "placeholder:use",
  "placeholder:read",
] as const;

let owner: ModuleRequestContext;

function contextOf(userId: string): ModuleRequestContext {
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

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds this date (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra"],
    chat: "openai/gpt-6.1-terra",
    document: null,
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, ["slides", "placeholder"]);
  registerModuleRuntime(deployment.context, MODULES);
  await insertAgentRecords(deployment.context);

  owner = contextOf(
    (await insertPersonWith(deployment.context, [...ALL_KEYS])).userId
  );
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const caller = () => callProcedure(slidesRouter, owner);

const KPI = {
  type: "kpi",
  title: "Amount",
  series: [
    {
      name: "Amount",
      dataset: "placeholder.records",
      query: { aggregates: [{ fn: "sum", field: "amountCents", as: "total" }] },
      value: "total",
    },
  ],
} as const;

const MISSING = {
  ...KPI,
  series: [{ ...KPI.series[0], dataset: "missing.records" }],
} as const;

const title = (text: string) => ({ kind: "title" as const, text });

const oneSlide = {
  slides: [{ id: "s1", elements: [title("A claim")] }],
};

const addKpi = {
  op: "add-slide" as const,
  slide: {
    elements: [title("Amount"), { kind: "figure" as const, chart: KPI }],
  },
} satisfies DeckChange;

async function rowOf(id: string) {
  const { rows } = await deployment.context.db.$client.query(
    "select title, content, content_hash, frozen_on::text, undo from deck where id = $1",
    [id]
  );

  return rows[0];
}

const ownDeck = (frozenOn = "2026-10-27") =>
  insertDeck(deployment.context, {
    ownerUserId: owner.caller.userId,
    content: oneSlide,
    frozenOn,
  });

describe("the slides decks on real data", () => {
  it("freeze the checked data of an added KPI and keep the freeze date", async () => {
    const id = await ownDeck();

    await caller().changeDeck({
      id,
      expectedHash: (await rowOf(id)).content_hash,
      changes: [addKpi],
    });

    const row = await rowOf(id);

    expect(row.content.slides[1].elements[1].data.rows[0].Amount).toBe(250000);
    expect(row.frozen_on).toBe("2026-10-27");
  });

  it("refuse a KPI on a deck frozen before the reporting date, and save a text change", async () => {
    const id = await ownDeck("2026-10-01");
    const before = await rowOf(id);

    await expect(
      caller().changeDeck({
        id,
        expectedHash: before.content_hash,
        changes: [addKpi],
      })
    ).rejects.toMatchObject({ code: "slides:refresh-first" });
    expect(await rowOf(id)).toEqual(before);

    await caller().changeDeck({
      id,
      expectedHash: before.content_hash,
      changes: [{ op: "rename", title: "Renamed" }],
    });

    expect(await rowOf(id)).toMatchObject({
      title: "Renamed",
      frozen_on: "2026-10-01",
    });
  });

  it("hide a KPI from a person who cannot read its dataset, and keep it stored", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "slides:use",
      "slides:read",
    ]);

    const figure = frozenElement("figure");

    const id = await insertDeck(deployment.context, {
      ownerUserId: userId,
      content: { slides: [{ id: "s1", elements: [title("Claim"), figure] }] },
    });

    const view = await callProcedure(slidesRouter, contextOf(userId)).readDeck({
      id,
    });

    expect(view.slides[0]?.elements[1]).toEqual({
      kind: "figure",
      hidden: true,
      chart: "chart" in figure ? figure.chart : undefined,
    });
    expect((await rowOf(id)).content.slides[0].elements[1]).toEqual(figure);
  });

  it("create a deck with slides, each data element gated and frozen on the reporting date", async () => {
    const deck = await createDeck(owner, {
      title: "Made by chat",
      slides: [
        { elements: [title("Amount"), { kind: "figure", chart: KPI }] },
        { elements: [title("Again"), { kind: "figure", chart: KPI }] },
      ],
    });

    const row = await rowOf(deck.id);

    expect(row.frozen_on).toBe("2026-10-27");
    expect(
      row.content.slides.map(
        (slide: { elements: { data: { rows: { Amount: number }[] } }[] }) =>
          slide.elements[1]?.data.rows[0]?.Amount
      )
    ).toEqual([250000, 250000]);
  });

  it("refuse a deck with one refused chart and create no deck", async () => {
    const count = async () =>
      (
        await deployment.context.db.$client.query(
          "select count(*)::int as n from deck where owner_user_id = $1",
          [owner.caller.userId]
        )
      ).rows[0].n;

    const before = await count();

    await expect(
      createDeck(owner, {
        title: "Half a deck",
        slides: [
          { elements: [title("Amount"), { kind: "figure", chart: KPI }] },
          { elements: [title("Missing"), { kind: "figure", chart: MISSING }] },
        ],
      })
    ).rejects.toMatchObject({
      code: "chart-invalid",
      issues: [{ path: "slides.1.elements.1.chart.series.0.dataset" }],
    });
    expect(await count()).toBe(before);
  });

  // Last: the new record moves the total that the cases above read.
  it("keep a frozen KPI byte for byte when only the slide title changes", async () => {
    const id = await ownDeck();

    const added = await caller().changeDeck({
      id,
      expectedHash: (await rowOf(id)).content_hash,
      changes: [addKpi],
    });

    const before = (await rowOf(id)).content.slides[1].elements[1];

    await insertPlaceholderRecord(deployment.context, {
      label: "Delta",
      recordedOn: "2026-04-01",
      amountCents: 10000,
      currency: "SGD",
    });

    await caller().changeDeck({
      id,
      expectedHash: added.contentHash,
      changes: [
        {
          op: "change-slide",
          slideId: "s2",
          slide: {
            // The editor sends the stored chart back (views.ts).
            elements: [
              title("Amount, retitled"),
              { kind: "figure", chart: before.chart },
            ],
          },
        },
      ],
    });

    const after = await rowOf(id);

    expect(after.content.slides[1].elements[0].text).toBe("Amount, retitled");
    expect(JSON.stringify(after.content.slides[1].elements[1])).toBe(
      JSON.stringify(before)
    );
  });
});

/** A KPI of Alpha's amount only, so a new record leaves its rows the same. */
const ALPHA = {
  ...KPI,
  title: "Alpha",
  series: [
    {
      ...KPI.series[0],
      name: "Alpha",
      query: {
        ...KPI.series[0].query,
        filters: [{ field: "label", op: "eq", value: "Alpha" }],
      },
    },
  ],
} as const;

// After the cases above: they read the totals before and after Delta (260000 cents in all).
describe("the slides Refresh data", () => {
  it("move the KPI to the new total and the date to the reporting date, name only that slide, and undo both", async () => {
    const made = await createDeck(owner, {
      title: "Refresh me",
      slides: [
        { elements: [title("Alpha"), { kind: "figure", chart: ALPHA }] },
        { elements: [title("Amount"), { kind: "figure", chart: KPI }] },
      ],
    });

    // A deck frozen on an earlier reporting date.
    await deployment.context.db.$client.query(
      "update deck set frozen_on = '2026-10-01' where id = $1",
      [made.id]
    );

    await insertPlaceholderRecord(deployment.context, {
      label: "Echo",
      recordedOn: "2026-05-01",
      amountCents: 5000,
      currency: "SGD",
    });

    const refreshed = await caller().refreshDeck({
      id: made.id,
      expectedHash: made.contentHash,
    });

    const amounts = async () => {
      const row = await rowOf(made.id);

      return {
        frozenOn: row.frozen_on,
        alpha: row.content.slides[0].elements[1].data.rows[0].Alpha,
        amount: row.content.slides[1].elements[1].data.rows[0].Amount,
      };
    };

    expect(refreshed.changedSlides).toEqual(["s2"]);
    expect(await amounts()).toEqual({
      frozenOn: "2026-10-27",
      alpha: 120000,
      amount: 265000,
    });

    await caller().undoDeck({
      id: made.id,
      expectedHash: refreshed.deck.contentHash,
    });

    expect(await amounts()).toEqual({
      frozenOn: "2026-10-01",
      alpha: 120000,
      amount: 260000,
    });
  });

  it("refuse a stale hash with deck-changed and change nothing", async () => {
    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: {
        slides: [
          { id: "s1", elements: [title("Records"), frozenElement("figure")] },
        ],
      },
      frozenOn: "2026-10-01",
    });

    const before = await rowOf(id);

    await caller().changeDeck({
      id,
      expectedHash: before.content_hash,
      changes: [{ op: "rename", title: "Renamed meanwhile" }],
    });

    const renamed = await rowOf(id);

    await expect(
      caller().refreshDeck({ id, expectedHash: before.content_hash })
    ).rejects.toMatchObject({ code: "slides:deck-changed" });
    expect(await rowOf(id)).toEqual(renamed);
  });

  it("refuse chart-invalid at the KPI's path to a person who lost placeholder:read and change nothing", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "slides:use",
      "slides:read",
      "slides:write",
    ]);

    const id = await insertDeck(deployment.context, {
      ownerUserId: userId,
      content: {
        slides: [
          { id: "s1", elements: [title("Claim")] },
          { id: "s2", elements: [title("Records"), frozenElement("figure")] },
        ],
      },
      frozenOn: "2026-10-01",
    });

    const before = await rowOf(id);

    await expect(
      callProcedure(slidesRouter, contextOf(userId)).refreshDeck({
        id,
        expectedHash: before.content_hash,
      })
    ).rejects.toMatchObject({
      code: "chart-invalid",
      issues: [{ path: "slides.1.elements.1.chart.series.0.dataset" }],
    });
    expect(await rowOf(id)).toEqual(before);
  });
});

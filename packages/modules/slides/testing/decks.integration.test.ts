import { randomUUID } from "node:crypto";

import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  withTransaction,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DeckContent } from "../src/content.ts";
import { slidesModule } from "../src/module.ts";
import { slidesRouter } from "../src/router.ts";
import { deckHashSql } from "../src/services/decks/hash.ts";
import { insertDeck } from "./factories.ts";

/**
 * The deck procedures against a real Postgres with the real histories applied. The module is
 * enabled, so the cases prove authorization and ownership, not the entitlement refusal. Every
 * caller is a real person whose keys come from a real role assignment.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([slidesModule]);
  await markSetupDone(deployment.context);
  // The factory freezes decks on 2026-10-27, so a chart change meets the gate, not
  // refresh-first (ruling F5). Before any settings read: the reader caches for 10 s (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra"],
    chat: "openai/gpt-6.1-terra",
    document: null,
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, ["slides"]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function callerAs(userId: string) {
  const context = {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: [slidesModule],
      userId,
      authenticated: true,
    }),
  } satisfies ModuleRequestContext;

  return callProcedure(slidesRouter, context);
}

const oneSlide: DeckContent = {
  slides: [{ id: "s1", elements: [{ kind: "title", text: "A claim" }] }],
};

describe("the slides listDecks procedure", () => {
  it("lists only the caller's own decks, the last changed first", async () => {
    const reader = ["slides:use", "slides:read"] as const;
    const a = await insertPersonWith(deployment.context, [...reader]);
    const b = await insertPersonWith(deployment.context, [...reader]);

    const a1 = await insertDeck(deployment.context, {
      ownerUserId: a.userId,
      title: "A1",
      content: oneSlide,
      frozenOn: "2026-09-30",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });

    const a2 = await insertDeck(deployment.context, {
      ownerUserId: a.userId,
      title: "A2",
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    });

    await insertDeck(deployment.context, {
      ownerUserId: b.userId,
      title: "B1",
      updatedAt: new Date("2026-10-03T00:00:00Z"),
    });

    expect(await callerAs(a.userId).listDecks()).toEqual([
      {
        id: a2,
        title: "A2",
        slideCount: 0,
        figuresAsOf: "2026-10-27",
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: a1,
        title: "A1",
        slideCount: 1,
        figuresAsOf: "2026-09-30",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("refuses the list to a person without slides:read", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "slides:use",
    ]);

    await insertDeck(deployment.context, { ownerUserId: userId });

    await expect(callerAs(userId).listDecks()).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

async function hashOf(title: string, content: DeckContent): Promise<string> {
  const hash = deckHashSql(title, content);

  const result = await deployment.context.db.execute<{ hash: string }>(
    sql`select ${hash} as hash`
  );

  const [row] = result.rows;

  if (row === undefined) throw new Error("the select returned no row");

  return row.hash;
}

describe("the slides content hash", () => {
  it("is the same for one content written with its keys in two orders", async () => {
    const reordered: DeckContent = {
      slides: [{ elements: [{ text: "A claim", kind: "title" }], id: "s1" }],
    };

    const hash = await hashOf("Q3", oneSlide);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashOf("Q3", reordered)).toBe(hash);
  });

  it("changes when only the title changes", async () => {
    expect(await hashOf("Q3", oneSlide)).not.toBe(await hashOf("Q4", oneSlide));
  });
});

const EDITOR = ["slides:use", "slides:read", "slides:write"] as const;

const editor = async () =>
  (await insertPersonWith(deployment.context, [...EDITOR])).userId;

/** The stored row as the database holds it, to prove a refused write wrote nothing. */
async function rowOf(id: string) {
  const { rows } = await deployment.context.db.$client.query(
    "select title, content, content_hash, frozen_on, undo from deck where id = $1",
    [id]
  );

  return rows[0];
}

async function auditOf(id: string) {
  const { rows } = await deployment.context.db.$client.query(
    "select action, actor_user_id, target_type, metadata from audit_event where target_id = $1 order by occurred_at, ctid",
    [id]
  );

  return rows;
}

/** An owner's deck of one slide `s1` with one Undo entry, so every procedure has work to do. */
async function ownedDeck(ownerUserId: string) {
  return insertDeck(deployment.context, {
    ownerUserId,
    title: "Owned",
    content: oneSlide,
    undo: [{ title: "Before", content: oneSlide, frozenOn: "2026-10-27" }],
  });
}

const hashOfRow = async (id: string): Promise<string> =>
  (await rowOf(id)).content_hash;

type Call = (
  caller: ReturnType<typeof callerAs>,
  id: string,
  expectedHash: string
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the cases read only the refusal, never the answer
) => Promise<unknown>;

const PROCEDURES: readonly (readonly [string, Call])[] = [
  ["readDeck", (caller, id) => caller.readDeck({ id })],
  [
    "changeDeck",
    (caller, id, expectedHash) =>
      caller.changeDeck({
        id,
        expectedHash,
        changes: [{ op: "rename", title: "Taken over" }],
      }),
  ],
  [
    "undoDeck",
    (caller, id, expectedHash) => caller.undoDeck({ id, expectedHash }),
  ],
  ["deleteDeck", (caller, id) => caller.deleteDeck({ id })],
];

/** A bar chart on a dataset this deployment lacks, so the chart gate refuses it now. */
const brokenChart = {
  type: "bar",
  title: "Missing",
  series: [
    {
      name: "Records",
      dataset: "missing.records",
      query: {
        groupBy: [{ field: "recordedOn", bucket: "month" }],
        aggregates: [{ fn: "count", as: "n" }],
      },
      x: "recordedOn",
      y: "n",
    },
  ],
} as const;

const title = (text: string) => ({ kind: "title" as const, text });

describe("the slides deck procedures", () => {
  it.each(PROCEDURES)(
    "answer not-found to %s on another person's deck and leave it the same",
    async (_, call) => {
      const id = await ownedDeck(await editor());
      const before = await rowOf(id);

      await expect(
        call(callerAs(await editor()), id, before.content_hash)
      ).rejects.toMatchObject({ code: "not-found" });
      expect(await rowOf(id)).toEqual(before);
    }
  );

  it.each([
    ["createDeck", ["slides:use", "slides:read"]],
    ["changeDeck", ["slides:use", "slides:read"]],
    ["undoDeck", ["slides:use", "slides:read"]],
    ["deleteDeck", ["slides:use", "slides:read"]],
    ["readDeck", ["slides:use", "slides:write"]],
  ] as const)(
    "refuse %s to a person without its key",
    async (procedure, keys) => {
      const { userId } = await insertPersonWith(deployment.context, [...keys]);
      const id = await ownedDeck(userId);
      const caller = callerAs(userId);

      const call =
        procedure === "createDeck"
          ? caller.createDeck({ title: "Mine" })
          : PROCEDURES.find(([name]) => name === procedure)?.[1](
              caller,
              id,
              await hashOfRow(id)
            );

      await expect(call).rejects.toMatchObject({ code: "forbidden" });
    }
  );

  it("refuse a change on an older hash and write nothing", async () => {
    const owner = await editor();
    const id = await ownedDeck(owner);
    const before = await rowOf(id);

    await expect(
      callerAs(owner).changeDeck({
        id,
        expectedHash: await hashOf("Older", oneSlide),
        changes: [{ op: "rename", title: "Hand save" }],
      })
    ).rejects.toMatchObject({ code: "slides:deck-changed" });

    expect(await rowOf(id)).toEqual(before);
  });

  it("refuse a chart on a dataset this deployment lacks and write nothing", async () => {
    const owner = await editor();
    const id = await ownedDeck(owner);
    const before = await rowOf(id);

    await expect(
      callerAs(owner).changeDeck({
        id,
        expectedHash: before.content_hash,
        changes: [
          {
            op: "add-slide",
            slide: {
              elements: [
                title("Broken"),
                { kind: "chart", chart: brokenChart },
              ],
            },
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "chart-invalid",
      issues: [{ path: "changes.0.slide.elements.1.chart.series.0.dataset" }],
    });

    expect(await rowOf(id)).toEqual(before);
    expect(await auditOf(id)).toEqual([]);
  });

  it("undo two renames in reverse order with their hashes, then answer nothing-to-undo", async () => {
    const caller = callerAs(await editor());
    const first = await caller.createDeck({ title: "First" });

    const second = await caller.changeDeck({
      id: first.id,
      expectedHash: first.contentHash,
      changes: [{ op: "rename", title: "Second" }],
    });

    const third = await caller.changeDeck({
      id: first.id,
      expectedHash: second.contentHash,
      changes: [{ op: "rename", title: "Third" }],
    });

    const once = await caller.undoDeck({
      id: first.id,
      expectedHash: third.contentHash,
    });

    const twice = await caller.undoDeck({
      id: first.id,
      expectedHash: once.contentHash,
    });

    expect(
      [once, twice].map((view) => ({
        title: view.title,
        contentHash: view.contentHash,
        canUndo: view.canUndo,
      }))
    ).toEqual([
      { title: "Second", contentHash: second.contentHash, canUndo: true },
      { title: "First", contentHash: first.contentHash, canUndo: false },
    ]);

    await expect(
      caller.undoDeck({ id: first.id, expectedHash: twice.contentHash })
    ).rejects.toMatchObject({ code: "slides:nothing-to-undo" });
  });

  it("refuse an image whose file is not one of the deck's images", async () => {
    const owner = await editor();
    const id = await ownedDeck(owner);

    await expect(
      callerAs(owner).changeDeck({
        id,
        expectedHash: await hashOfRow(id),
        changes: [
          {
            op: "add-slide",
            slide: {
              elements: [
                title("Picture"),
                { kind: "image", fileId: randomUUID(), alt: "A picture" },
              ],
            },
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "slides:change-invalid",
      issues: [
        {
          path: "changes.0.slide.elements.1.fileId",
          message: "Upload this image to the deck first.",
        },
      ],
    });
  });

  it("write one audit row for each create, change, Undo and delete", async () => {
    const owner = await editor();
    const caller = callerAs(owner);
    const created = await caller.createDeck({ title: "Audited" });

    const changed = await caller.changeDeck({
      id: created.id,
      expectedHash: created.contentHash,
      changes: [
        { op: "rename", title: "Audited again" },
        { op: "add-slide", slide: { elements: [title("A claim")] } },
      ],
    });

    await caller.undoDeck({
      id: created.id,
      expectedHash: changed.contentHash,
    });
    await caller.deleteDeck({ id: created.id });

    const row = (
      action: string,
      metadata: Readonly<Record<string, number>>
    ) => ({
      action: `slides:deck-${action}`,
      actor_user_id: owner,
      target_type: "slides-deck",
      metadata,
    });

    expect(await auditOf(created.id)).toEqual([
      row("created", { slides: 0 }),
      row("changed", { steps: 2 }),
      row("undone", {}),
      row("deleted", {}),
    ]);
  });

  it("delete the deck's image and export files with the deck", async () => {
    const owner = await editor();

    const [image, exported] = await withTransaction(
      deployment.context,
      async (tx) =>
        Promise.all(
          ["image.png", "deck.pptx"].map(
            async (fileName) =>
              (
                await deployment.context.fileStorage.store(
                  {
                    fileName,
                    mimeType: "image/png",
                    bytes: Buffer.from(fileName),
                    uploadedByUserId: owner,
                  },
                  tx
                )
              ).id
          )
        )
    );

    if (image === undefined || exported === undefined) {
      throw new Error("the files were not stored");
    }

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner,
      imageFileIds: [image],
      exportFileId: exported,
    });

    await callerAs(owner).deleteDeck({ id });

    const { rows } = await deployment.context.db.$client.query(
      "select id from file where id = any($1::uuid[])",
      [[image, exported]]
    );

    expect(rows).toEqual([]);
  });
});

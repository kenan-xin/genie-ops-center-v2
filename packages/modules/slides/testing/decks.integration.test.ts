import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
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

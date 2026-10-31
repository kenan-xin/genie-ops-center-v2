import { randomUUID } from "node:crypto";

import { startDisposableDeployment } from "@genie/core/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMPTY_DECK_CONTENT } from "../src/content.ts";
import { slidesModule } from "../src/module.ts";
import { deck } from "../src/schema.ts";
import { insertDeck } from "./factories.ts";

/**
 * The `deck` constraints on a real Postgres with the real migration history. Each row is a write
 * the schema itself must refuse, whatever code sends it. No part of the database is mocked.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([slidesModule]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const t = () => deployment.context;

// The owner is a user id by value, with no foreign key (data-shape module rule 2).
const anOwner = () => randomUUID();

const titleSlide = (index: number) => ({
  id: `s${index + 1}`,
  elements: [{ kind: "title" as const, text: "A claim" }],
});

describe("the slides schema", () => {
  it.each([
    [
      "a blank title",
      () => insertDeck(t(), { ownerUserId: anOwner(), title: "   " }),
    ],
    [
      "a title of 81 characters",
      () => insertDeck(t(), { ownerUserId: anOwner(), title: "a".repeat(81) }),
    ],
    [
      "a content hash that is not 64 hex characters",
      async () => {
        const id = await insertDeck(t(), { ownerUserId: anOwner() });

        await t()
          .db.update(deck)
          .set({ contentHash: "A".repeat(64) })
          .where(eq(deck.id, id));
      },
    ],
    [
      "an undo list of 11 entries",
      () =>
        insertDeck(t(), {
          ownerUserId: anOwner(),
          undo: Array.from({ length: 11 }, () => ({
            title: "Receivables",
            content: EMPTY_DECK_CONTENT,
            frozenOn: "2026-10-27",
          })),
        }),
    ],
    [
      "21 slides",
      () =>
        insertDeck(t(), {
          ownerUserId: anOwner(),
          content: {
            slides: Array.from({ length: 21 }, (_, i) => titleSlide(i)),
          },
        }),
    ],
  ])("refuses %s", async (_, write) => {
    await expect(write()).rejects.toThrow();
  });
});

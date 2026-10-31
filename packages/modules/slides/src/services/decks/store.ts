import {
  AppError,
  type AppErrorIssue,
  checkChart,
  CORE_ERRORS,
  moduleAudit,
  type ModuleRequestContext,
  reportingDate,
  type TenantTransaction,
  withTransaction,
} from "@genie/core";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import {
  type DeckContent,
  deckContentSchema,
  type FrozenChart,
  type UndoEntry,
} from "../../content.ts";
import type {
  DeckChange,
  DeckSummary,
  ElementInput,
  SlideInput,
} from "../../contract.ts";
import { SLIDES_ERRORS } from "../../errors.ts";
import { deck } from "../../schema.ts";
import { applyChanges, pushUndo } from "./changes.ts";
import { deckHashSql } from "./hash.ts";

export type DeckRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly content: DeckContent;
  readonly contentHash: string;
  readonly frozenOn: string;
  readonly undo: readonly UndoEntry[];
  readonly imageFileIds: readonly string[];
  readonly exportFileId: string | null;
  readonly updatedAt: Date;
};

const audit = moduleAudit("slides");

const RECORD = {
  id: deck.id,
  ownerUserId: deck.ownerUserId,
  title: deck.title,
  content: deck.content,
  contentHash: deck.contentHash,
  frozenOn: deck.frozenOn,
  undo: deck.undo,
  imageFileIds: deck.imageFileIds,
  exportFileId: deck.exportFileId,
  updatedAt: deck.updatedAt,
};

/** The caller's own row. The id compares as text, so an id that is not a uuid finds nothing (R-52). */
const own = (ctx: ModuleRequestContext, id: string) =>
  and(eq(deck.ownerUserId, ctx.caller.userId), sql`${deck.id}::text = ${id}`);

const notFound = () => new AppError(CORE_ERRORS["not-found"]);

const targetOf = (id: string) => ({ type: "slides-deck", id });

const IMAGE_NOT_UPLOADED = "Upload this image to the deck first.";

function refuseIf(issues: readonly AppErrorIssue[]): void {
  if (issues.length > 0) {
    throw new AppError(SLIDES_ERRORS["change-invalid"], { issues });
  }
}

/** Each image of the given slides that names a file outside the deck's own images (D6). */
function foreignImages(
  imageFileIds: readonly string[],
  slides: readonly {
    readonly path: string;
    readonly elements: readonly ElementInput[];
  }[]
): AppErrorIssue[] {
  return slides.flatMap(({ path, elements }) =>
    elements.flatMap((element, index) =>
      element.kind === "image" && !imageFileIds.includes(element.fileId)
        ? [
            {
              path: `${path}.elements.${index}.fileId`,
              message: IMAGE_NOT_UPLOADED,
            },
          ]
        : []
    )
  );
}

/** The chart gate, with each refused issue moved under `prefix` (R-15), answered as frozen data (D3). */
async function gate(
  ctx: ModuleRequestContext,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a raw chart config; the gate is its parser
  chart: unknown,
  prefix: string
): Promise<FrozenChart> {
  try {
    const checked = await checkChart(ctx, chart);

    return { chart: checked.config, data: checked.data };
  } catch (cause) {
    if (!(cause instanceof AppError) || cause.code !== "chart-invalid") {
      throw cause;
    }

    throw new AppError(CORE_ERRORS["chart-invalid"], {
      issues: (cause.issues ?? []).map(({ path, message }) => ({
        path: `${prefix}${path}`,
        message,
      })),
    });
  }
}

/** The server's parse of the content about to be written; a refusal is the caller's change. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- drafts with their frozen data put in; the schema is their parser
function parseContent(content: unknown): DeckContent {
  const parsed = deckContentSchema.safeParse(content);

  if (parsed.success) return parsed.data;

  throw new AppError(SLIDES_ERRORS["change-invalid"], {
    issues: parsed.error.issues.map(({ path, message }) => ({
      path: path.join("."),
      message,
    })),
  });
}

/** The caller's own deck, as stored. Another owner's deck answers `not-found`, as a missing id (R-52). */
export async function readOwnDeck(
  ctx: ModuleRequestContext,
  id: string
): Promise<DeckRecord> {
  const [row] = await ctx.tenant.db
    .select(RECORD)
    .from(deck)
    .where(own(ctx, id));

  if (row === undefined) throw notFound();

  return row;
}

/**
 * Locks the caller's own row in `tx` and answers it. With `expectedHash`, a deck whose content
 * moved since that hash was read answers `deck-changed`, so a save never overwrites another (R-53).
 */
export async function lockOwnDeck(
  tx: TenantTransaction,
  ctx: ModuleRequestContext,
  id: string,
  expectedHash?: string
): Promise<DeckRecord> {
  const [row] = await tx
    .select(RECORD)
    .from(deck)
    .where(own(ctx, id))
    .for("update");

  if (row === undefined) throw notFound();

  if (expectedHash !== undefined && expectedHash !== row.contentHash) {
    throw new AppError(SLIDES_ERRORS["deck-changed"]);
  }

  return row;
}

/** Writes one save over the locked row; the hash is computed in the same statement (D2). */
async function save(
  tx: TenantTransaction,
  id: string,
  next: UndoEntry,
  undo: readonly UndoEntry[]
): Promise<DeckRecord> {
  const [saved] = await tx
    .update(deck)
    .set({
      title: next.title,
      content: next.content,
      contentHash: deckHashSql(next.title, next.content),
      frozenOn: next.frozenOn,
      undo,
      updatedAt: sql`now()`,
    })
    .where(eq(deck.id, id))
    .returning(RECORD);

  // `lockOwnDeck` locked the row in this transaction, so the update finds it.
  if (saved === undefined) throw new Error("the locked deck is gone");

  return saved;
}

/**
 * A new deck of the caller, its figures frozen on the reporting date (D3). With slides (the chat
 * tool), each data element passes the gate first and no image is allowed, because a new deck has
 * no uploaded image (D6). A create adds no Undo entry: Delete is its inverse (D1).
 */
export async function createDeck(
  ctx: ModuleRequestContext,
  input: { readonly title: string; readonly slides?: readonly SlideInput[] }
): Promise<DeckRecord> {
  const frozenOn = await reportingDate(ctx.tenant);
  const slides = input.slides ?? [];

  const drafts = [];

  for (const [i, slide] of slides.entries()) {
    const elements = [];

    for (const [j, element] of slide.elements.entries()) {
      elements.push(
        element.kind === "figure" ||
          element.kind === "chart" ||
          element.kind === "table"
          ? {
              kind: element.kind,
              // One at a time, so a refusal always names the same element.
              // oxlint-disable-next-line no-await-in-loop
              ...(await gate(
                ctx,
                element.chart,
                `slides.${i}.elements.${j}.chart.`
              )),
            }
          : element
      );
    }

    drafts.push({ id: `s${i + 1}`, elements });
  }

  refuseIf(
    foreignImages(
      [],
      slides.map((slide, i) => ({
        path: `slides.${i}`,
        elements: slide.elements,
      }))
    )
  );

  const content = parseContent({ slides: drafts });

  return withTransaction(ctx.tenant, async (tx) => {
    const [row] = await tx
      .insert(deck)
      .values({
        ownerUserId: ctx.caller.userId,
        title: input.title,
        content,
        contentHash: deckHashSql(input.title, content),
        frozenOn,
      })
      .returning(RECORD);

    if (row === undefined) throw new Error("the insert returned no row");

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "slides:deck-created",
      targetOf(row.id),
      "Created a deck.",
      { slides: content.slides.length }
    );

    return row;
  });
}

/**
 * Applies the steps to the caller's own deck. Each added or changed figure, chart or table passes
 * the gate; one sent back with its stored chart keeps its frozen data (R-54). A data change on a
 * deck frozen before the reporting date answers `refresh-first` before any query. Without
 * `expectedHash` the steps apply to the content read here.
 *
 * The gate runs before the transaction, so no save holds a row lock while chart queries run. The
 * transaction then locks the row and refuses `deck-changed` if another save moved its hash.
 */
export async function changeDeck(
  ctx: ModuleRequestContext,
  input: {
    readonly id: string;
    readonly expectedHash?: string;
    readonly changes: readonly DeckChange[];
  }
): Promise<DeckRecord> {
  const row = await readOwnDeck(ctx, input.id);

  if (
    input.expectedHash !== undefined &&
    input.expectedHash !== row.contentHash
  ) {
    throw new AppError(SLIDES_ERRORS["deck-changed"]);
  }

  const applied = applyChanges(row, input.changes);

  if (
    applied.checks.size > 0 &&
    (await reportingDate(ctx.tenant)) !== row.frozenOn
  ) {
    throw new AppError(SLIDES_ERRORS["refresh-first"]);
  }

  const checked = new Map<string, FrozenChart>();

  for (const [key, step] of applied.checks) {
    const [slideId, index] = key.split(".");

    const element = applied.slides.find(({ id }) => id === slideId)?.elements[
      Number(index)
    ];

    checked.set(
      key,
      // One at a time, so a refusal always names the same step.
      // oxlint-disable-next-line no-await-in-loop
      await gate(
        ctx,
        element !== undefined && "chart" in element ? element.chart : undefined,
        `changes.${step}.slide.elements.${index}.chart.`
      )
    );
  }

  refuseIf(
    foreignImages(
      row.imageFileIds,
      input.changes.flatMap((change, step) =>
        change.op === "add-slide" || change.op === "change-slide"
          ? [{ path: `changes.${step}.slide`, elements: change.slide.elements }]
          : []
      )
    )
  );

  const content = parseContent({
    slides: applied.slides.map((slide) => ({
      id: slide.id,
      elements: slide.elements.map((element, index) => {
        const frozen = checked.get(`${slide.id}.${index}`);

        return frozen === undefined
          ? element
          : { kind: element.kind, ...frozen };
      }),
    })),
  });

  return withTransaction(ctx.tenant, async (tx) => {
    await lockOwnDeck(tx, ctx, row.id, row.contentHash);

    const saved = await save(
      tx,
      row.id,
      { title: applied.title, content, frozenOn: row.frozenOn },
      pushUndo(row.undo, {
        title: row.title,
        content: row.content,
        frozenOn: row.frozenOn,
      })
    );

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "slides:deck-changed",
      targetOf(row.id),
      "Changed a deck.",
      { steps: input.changes.length }
    );

    return saved;
  });
}

/**
 * Restores the newest save as stored, frozen figures and their date included, so it runs no
 * query and the gate cannot refuse it (D1).
 */
export async function undoDeck(
  ctx: ModuleRequestContext,
  input: { readonly id: string; readonly expectedHash: string }
): Promise<DeckRecord> {
  return withTransaction(ctx.tenant, async (tx) => {
    const row = await lockOwnDeck(tx, ctx, input.id, input.expectedHash);
    const [entry, ...rest] = row.undo;

    if (entry === undefined) {
      throw new AppError(SLIDES_ERRORS["nothing-to-undo"]);
    }

    const saved = await save(tx, row.id, entry, rest);

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "slides:deck-undone",
      targetOf(row.id),
      "Undid the last change of a deck."
    );

    return saved;
  });
}

/** Deletes the caller's own deck with its image and export files, in one transaction (D6, D7). */
export async function deleteDeck(
  ctx: ModuleRequestContext,
  id: string
): Promise<void> {
  await withTransaction(ctx.tenant, async (tx) => {
    const [deleted] = await tx.delete(deck).where(own(ctx, id)).returning({
      id: deck.id,
      imageFileIds: deck.imageFileIds,
      exportFileId: deck.exportFileId,
    });

    if (deleted === undefined) throw notFound();

    await ctx.tenant.fileStorage.remove(
      deleted.exportFileId === null
        ? deleted.imageFileIds
        : [...deleted.imageFileIds, deleted.exportFileId],
      tx
    );

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "slides:deck-deleted",
      targetOf(deleted.id),
      "Deleted a deck."
    );
  });
}

/** The caller's own decks, the last changed first. Another owner's row never reads (R-52). */
export async function listOwnDecks(
  ctx: ModuleRequestContext
): Promise<DeckSummary[]> {
  const rows = await ctx.tenant.db
    .select({
      id: deck.id,
      title: deck.title,
      slideCount:
        sql<number>`jsonb_array_length(${deck.content} -> 'slides')`.mapWith(
          Number
        ),
      figuresAsOf: deck.frozenOn,
      updatedAt: deck.updatedAt,
    })
    .from(deck)
    .where(eq(deck.ownerUserId, ctx.caller.userId))
    .orderBy(desc(deck.updatedAt), asc(deck.id));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slideCount: row.slideCount,
    figuresAsOf: row.figuresAsOf,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

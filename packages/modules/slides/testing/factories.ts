import { randomBytes } from "node:crypto";

import type { PanelConfig, TenantContext } from "@genie/core";
import type { ChartData, ChartKind, ChartRow } from "@genie/ui";

import {
  type DeckContent,
  EMPTY_DECK_CONTENT,
  type StoredElement,
  type UndoEntry,
} from "../src/content.ts";
import { deck } from "../src/schema.ts";
import { deckHashSql } from "../src/services/decks/hash.ts";

/**
 * Inserts one `deck` row directly, with no gate, and answers its id. The hash is computed by
 * Postgres as the store computes it. The module owns the factories for its own tables, and core
 * never imports this file (R-39).
 */
export async function insertDeck(
  tenant: TenantContext,
  input: {
    readonly ownerUserId: string;
    readonly id?: string;
    readonly title?: string;
    readonly content?: DeckContent;
    readonly frozenOn?: string;
    readonly undo?: readonly UndoEntry[];
    readonly imageFileIds?: readonly string[];
    readonly exportFileId?: string;
    readonly updatedAt?: Date;
  }
): Promise<string> {
  const title = input.title ?? `Deck ${randomBytes(4).toString("hex")}`;
  const content = input.content ?? EMPTY_DECK_CONTENT;

  const [row] = await tenant.db
    .insert(deck)
    .values({
      // Drizzle writes the column default for an undefined value.
      id: input.id,
      ownerUserId: input.ownerUserId,
      title,
      content,
      contentHash: deckHashSql(title, content),
      frozenOn: input.frozenOn ?? "2026-10-27",
      undo: input.undo ?? [],
      imageFileIds:
        input.imageFileIds === undefined ? undefined : [...input.imageFileIds],
      exportFileId: input.exportFileId,
      updatedAt: input.updatedAt,
    })
    .returning({ id: deck.id });

  if (row === undefined) throw new Error("the insert returned no row");

  return row.id;
}

const DATASET = "placeholder.records";

const count = { aggregates: [{ fn: "count" as const, as: "n" }] };

const value = { key: "n", label: "Records", type: "number" } as const;

const TABLE_COLUMNS = [1, 2, 3, 4, 5].map((n) => ({
  key: `c${n}`,
  label: `Column ${n}`,
  type: "text" as const,
}));

/** The month of index `i`, from January 2021, so 60 rows stay distinct. */
const month = (i: number) =>
  new Date(Date.UTC(2021, i, 1)).toISOString().slice(0, 10);

function rowOf(kind: ChartKind, i: number): ChartRow {
  switch (kind) {
    case "kpi":
      return { n: i + 1 };
    case "donut":
      return { x: `Part ${i + 1}`, n: i + 1 };
    case "table":
      return Object.fromEntries(
        TABLE_COLUMNS.map(({ key }) => [key, `${key} of row ${i + 1}`])
      );
    default:
      return { x: month(i), n: i + 1 };
  }
}

/** Chart data as the gate answers it, with `rows` rows of the placeholder dataset. */
export function chartDataFixture(kind: ChartKind, rows: number): ChartData {
  const x =
    kind === "donut"
      ? { key: "x", label: "Part", type: "text" as const }
      : {
          key: "x",
          label: "Month",
          type: "date" as const,
          bucket: "month" as const,
        };

  const data: ChartData = {
    kind,
    title: "Records",
    columns: kind === "table" ? TABLE_COLUMNS : [value],
    rows: Array.from({ length: rows }, (_, i) => rowOf(kind, i)),
    datasets: [DATASET],
    readAt: "2026-10-27T02:00:00.000Z",
    truncated: false,
  };

  return kind === "kpi" || kind === "table" ? data : { ...data, x };
}

const CONFIG = {
  figure: {
    type: "kpi",
    title: "Records",
    series: [{ name: "Records", dataset: DATASET, query: count, value: "n" }],
  },
  chart: {
    type: "bar",
    title: "Records by month",
    series: [
      {
        name: "Records",
        dataset: DATASET,
        query: {
          groupBy: [{ field: "recordedOn", bucket: "month" as const }],
          ...count,
        },
        x: "recordedOn",
        y: "n",
      },
    ],
  },
  table: {
    type: "table",
    title: "Records",
    series: [
      { name: "Records", dataset: DATASET, query: { select: ["label"] } },
    ],
  },
} satisfies Record<string, PanelConfig>;

/** A frozen figure (KPI), chart (bar) or table element over the placeholder dataset. */
export function frozenElement(
  kind: "figure" | "chart" | "table",
  rows?: number
): StoredElement {
  const chart = CONFIG[kind];

  return {
    kind,
    chart,
    data: chartDataFixture(chart.type, rows ?? (kind === "figure" ? 1 : 3)),
  };
}

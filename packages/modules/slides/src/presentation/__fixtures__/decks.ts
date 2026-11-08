import type { PanelConfig } from "@genie/core";
import type { ChartData } from "@genie/ui";

import type { DeckListView, DeckPageView, ShownSlide } from "../views.ts";

const KPI: PanelConfig = {
  type: "kpi",
  title: "Invoiced sales",
  series: [
    {
      name: "Invoiced",
      dataset: "placeholder.records",
      query: {
        aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
      },
      value: "total",
    },
  ],
};

const BAR: PanelConfig = {
  type: "bar",
  title: "Invoiced by month",
  series: [
    {
      name: "Invoiced",
      dataset: "placeholder.records",
      query: {
        groupBy: [{ field: "recordedOn", bucket: "month" }],
        aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
      },
      x: "recordedOn",
      y: "total",
    },
  ],
};

const TABLE: PanelConfig = {
  type: "table",
  title: "Customers who paid late",
  series: [
    {
      name: "Customers",
      dataset: "placeholder.records",
      query: {
        select: ["customerName", "invoiceNumber", "dueDate", "amountCents"],
      },
    },
  ],
};

const KPI_DATA: ChartData = {
  kind: "kpi",
  title: "Invoiced sales",
  columns: [
    { key: "total", label: "Invoiced sales", type: "money", currency: "SGD" },
  ],
  rows: [{ total: 250000 }],
  datasets: ["placeholder.records"],
  readAt: "2026-10-27T09:00:00.000Z",
  truncated: false,
};

const BAR_DATA: ChartData = {
  kind: "bar",
  title: "Invoiced by month",
  x: { key: "month", label: "Month", type: "date", bucket: "month" },
  columns: [
    { key: "total", label: "Invoiced", type: "money", currency: "SGD" },
  ],
  rows: [
    { month: "2026-05-01", total: 150000 },
    { month: "2026-06-01", total: 210000 },
    { month: "2026-07-01", total: 180000 },
    { month: "2026-08-01", total: 260000 },
    { month: "2026-09-01", total: 240000 },
    { month: "2026-10-01", total: 250000 },
  ],
  datasets: ["placeholder.records"],
  readAt: "2026-10-27T09:00:00.000Z",
  truncated: false,
};

const TABLE_COLUMNS = [
  { key: "customerName", label: "Customer", type: "text" },
  { key: "invoiceNumber", label: "Invoice", type: "text" },
  { key: "dueDate", label: "Due", type: "date" },
  { key: "total", label: "Amount", type: "money", currency: "SGD" },
  { key: "status", label: "Status", type: "text" },
] as const;

const TABLE_ROWS = [
  ["ABC Trading", "INV-1042", "2026-08-12", 128000, "Paid"],
  ["Harbor Foods", "INV-1043", "2026-08-15", 96000, "Paid"],
  ["Orchid Retail", "INV-1044", "2026-08-19", 74000, "Paid"],
  ["Delta Works", "INV-1045", "2026-09-02", 65000, "Open"],
  ["Kite Studio", "INV-1046", "2026-09-06", 54000, "Paid"],
  ["Lumen Supply", "INV-1047", "2026-09-11", 49000, "Open"],
  ["Northline", "INV-1048", "2026-09-15", 46000, "Paid"],
  ["Oak & Co", "INV-1049", "2026-09-20", 38000, "Paid"],
  ["Penrose", "INV-1050", "2026-09-24", 32000, "Open"],
  ["Quarry Ltd", "INV-1051", "2026-09-28", 29000, "Paid"],
  ["Ridgeway", "INV-1052", "2026-10-02", 26000, "Paid"],
  ["Sable Group", "INV-1053", "2026-10-06", 22000, "Open"],
] as const;

const TABLE_DATA: ChartData = {
  kind: "table",
  title: TABLE.title,
  columns: [...TABLE_COLUMNS],
  rows: TABLE_ROWS.map(
    ([customerName, invoiceNumber, dueDate, total, status]) => ({
      customerName,
      invoiceNumber,
      dueDate,
      total,
      status,
    })
  ),
  datasets: ["placeholder.records"],
  readAt: "2026-10-27T09:00:00.000Z",
  truncated: false,
};

/** A six-figure KPI, the width case the 260 px box must hold on one line. */
const LARGE_KPI_DATA: ChartData = {
  ...KPI_DATA,
  rows: [{ total: 14120000 }],
};

export const IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23e2e8f0'/%3E%3C/svg%3E";

export const titleOnlySlide: ShownSlide = {
  id: "s1",
  elements: [
    { kind: "title", text: "Cash in moved ahead of the plan this quarter" },
  ],
};

export const textWithChartSlide: ShownSlide = {
  id: "s2",
  elements: [
    { kind: "title", text: "Collections narrowed the gap to the plan line" },
    {
      kind: "text",
      text: "Cash in grew in every month of the quarter, and the two customers that paid late in August settled in September, so the gap between invoiced sales and collected cash narrowed to its smallest point of the year.",
    },
    { kind: "chart", chart: BAR, data: BAR_DATA },
  ],
};

export const bulletsWithTwoVisualsSlide: ShownSlide = {
  id: "s3",
  elements: [
    { kind: "title", text: "Three customers account for most late payments" },
    {
      kind: "bullets",
      items: [
        "Three customers paid late in August",
        "Two of them settled in full by mid September",
        "One balance remains open beyond the agreed terms",
        "Collections covered 82 percent of invoiced sales",
        "The plan line was met for the first time this year",
      ],
    },
    { kind: "figure", chart: KPI, data: KPI_DATA },
    {
      kind: "image",
      fileId: "image-1",
      alt: "A photograph of the finance team meeting at a table.",
    },
  ],
};

export const hiddenSlide: ShownSlide = {
  id: "s4",
  elements: [
    { kind: "title", text: "One chart is no longer available to this person" },
    { kind: "chart", hidden: true, chart: BAR },
  ],
};

export const imageSlide: ShownSlide = {
  id: "s5",
  elements: [
    { kind: "title", text: "The finance team reviews overdue balances weekly" },
    {
      kind: "image",
      fileId: "image-1",
      alt: "A photograph of the finance team meeting at a table.",
    },
  ],
};

export const textOnlySlide: ShownSlide = {
  id: "s6",
  elements: [
    { kind: "title", text: "The quarter closed without an open dispute" },
    {
      kind: "text",
      text: "No invoice raised this quarter is under dispute, and the two balances that remain open sit within the agreed terms.",
    },
  ],
};

/** The longest content the schema lets one slide hold: 90 title, five 80-char bullets, 12 x 5 table. */
export const longestSlide: ShownSlide = {
  id: "s7",
  elements: [
    {
      kind: "title",
      text: "Collections covered four fifths of invoiced sales while three customers settled late",
    },
    {
      kind: "bullets",
      items: [
        "Three customers paid late in August and two settled before September ended",
        "One balance remains open beyond its agreed terms by eleven calendar days",
        "Collections covered eighty two percent of invoiced sales in the quarter",
        "The plan line was met in September for the first time since the year began",
        "No invoice raised this quarter is under dispute with any of the customers",
      ],
    },
    { kind: "table", chart: TABLE, data: TABLE_DATA },
  ],
};

/** A large KPI beside an image: the two 260 px visual boxes the schema allows. */
export const largeKpiSlide: ShownSlide = {
  id: "s8",
  elements: [
    { kind: "title", text: "Invoiced sales reached a six-figure total" },
    {
      kind: "bullets",
      items: ["The quarter closed above plan", "Two customers paid in full"],
    },
    { kind: "figure", chart: KPI, data: LARGE_KPI_DATA },
    {
      kind: "image",
      fileId: "image-1",
      alt: "A photograph of the finance team meeting at a table.",
    },
  ],
};

/** A 12 x 5 table beside a KPI: the table needs the wide visual column (round 1 I1, T4-FIT). */
export const tableWithVisualSlide: ShownSlide = {
  id: "s9",
  elements: [
    { kind: "title", text: "Three customers hold most of the open balance" },
    { kind: "figure", chart: KPI, data: KPI_DATA },
    { kind: "table", chart: TABLE, data: TABLE_DATA },
  ],
};

export const deckPage: DeckPageView = {
  deck: {
    id: "deck-1",
    title: "Receivables at a glance",
    contentHash: "0".repeat(64),
    figuresAsOf: "2026-10-27",
    canUndo: true,
    slides: [
      titleOnlySlide,
      textWithChartSlide,
      bulletsWithTwoVisualsSlide,
      hiddenSlide,
      imageSlide,
    ],
    images: {
      "image-1": { url: IMAGE_URL, expiresAt: "2099-01-01T00:00:00.000Z" },
    },
  },
  canWrite: true,
  timeZone: "Asia/Singapore",
  theme: {
    companyName: "Genie Ops",
    primaryColor: "#0f766e",
    fontFace: "Plus Jakarta Sans",
  },
  logoUrl: null,
};

export const emptyDeckPage: DeckPageView = {
  ...deckPage,
  deck: { ...deckPage.deck, slides: [] },
};

export const deckList: DeckListView = {
  decks: [
    {
      id: "deck-1",
      title: "Receivables at a glance",
      slideCount: 5,
      figuresAsOf: "2026-10-27",
      updatedAt: "2026-10-27T09:00:00.000Z",
    },
    {
      id: "deck-2",
      title: "Cash in",
      slideCount: 1,
      figuresAsOf: "2026-10-26",
      updatedAt: "2026-10-26T09:00:00.000Z",
    },
  ],
  canWrite: true,
  timeZone: "Asia/Singapore",
  chat: {
    kind: "on",
    models: null,
    labels: {
      steps: {
        "slides-create-deck": {
          active: "Making a deck",
          done: "Made a deck",
          failed: "Could not make a deck",
        },
      },
      datasets: {},
      fields: {},
    },
    suggestions: [],
  },
};

export const emptyDeckList: DeckListView = { ...deckList, decks: [] };

export const chatOffDeckList: DeckListView = {
  ...deckList,
  chat: { kind: "off" },
};

export const noChatDeckList: DeckListView = {
  ...deckList,
  chat: { kind: "none" },
};

export const readOnlyDeckList: DeckListView = {
  ...deckList,
  canWrite: false,
};

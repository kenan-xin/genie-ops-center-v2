import type { PanelConfig } from "@genie/core";
import type { ChartData } from "@genie/ui";

import { SLIDES_CHANGE_FIGURE } from "./slides-change.ts";

/**
 * The deck of the eight layouts (czjw.183) that `deck-look.spec.ts` seeds, in the prototype's
 * order: title, figure, chart, two figures, comparison, table, Priorities, statement. Its charts
 * read the invoices datasets, which the Slides chat person may read, so none is hidden.
 */
export const DECK_LOOK_TITLE = "Receivables at a glance";

const READ_AT = "2026-10-27T02:00:00.000Z";

const MONTHS = [
  "2026-05-01",
  "2026-06-01",
  "2026-07-01",
  "2026-08-01",
  "2026-09-01",
  "2026-10-01",
];

const monthly = (
  title: string,
  dataset: "invoices.invoices" | "invoices.payments",
  field: string,
  amountField: string
): PanelConfig => ({
  type: "line",
  title,
  series: [
    {
      name: title,
      dataset,
      query: {
        groupBy: [{ field, bucket: "month" }],
        aggregates: [{ fn: "sum", field: amountField, as: "total" }],
      },
      x: field,
      y: "total",
    },
  ],
});

const monthlyData = (
  title: string,
  source: string,
  amounts: readonly number[]
): ChartData => ({
  kind: "line",
  title,
  x: { key: "month", label: "Month", type: "date", bucket: "month" },
  columns: [{ key: "total", label: title, type: "money", currency: "SGD" }],
  rows: MONTHS.map((month, at) => ({ month, total: amounts[at] ?? 0 })),
  datasets: [source === "Invoices" ? "invoices.invoices" : "invoices.payments"],
  sources: [source],
  readAt: READ_AT,
  truncated: false,
});

const INVOICED = monthly(
  "Invoiced by month",
  "invoices.invoices",
  "invoiceDate",
  "totalCents"
);

const COLLECTED = monthly(
  "Collected by month",
  "invoices.payments",
  "paymentDate",
  "amountCents"
);

/** A line chart, the kind whose first x label ran under the y labels in a comparison box (F10). */
const invoicedChart = {
  kind: "chart",
  chart: INVOICED,
  data: monthlyData(
    "Invoiced by month",
    "Invoices",
    [150000, 210000, 180000, 260000, 240000, 250000]
  ),
} as const;

const collectedChart = {
  kind: "chart",
  chart: COLLECTED,
  data: monthlyData(
    "Collected by month",
    "Payments",
    [50000, 70000, 60000, 86000, 80000, 83000]
  ),
} as const;

const NOTE = {
  kind: "text",
  text: "Collections follow invoiced sales by about one month.",
} as const;

const LATE_CUSTOMERS: PanelConfig = {
  type: "table",
  title: "Customers who paid late",
  series: [
    {
      name: "Invoices",
      dataset: "invoices.invoices",
      query: { select: ["customerName", "invoiceNumber", "dueDate"] },
    },
  ],
};

const LATE_ROWS = [
  ["ABC Trading", "INV-1042", "2026-08-12"],
  ["Harbor Foods", "INV-1043", "2026-08-15"],
  ["Orchid Retail", "INV-1044", "2026-08-19"],
  ["Delta Works", "INV-1045", "2026-09-02"],
  ["Kite Studio", "INV-1046", "2026-09-06"],
] as const;

export const DECK_LOOK_CONTENT = {
  slides: [
    {
      id: "l1",
      elements: [
        { kind: "title", text: DECK_LOOK_TITLE },
        { kind: "text", text: "E2E · October 2026 collections update" },
      ],
    },
    {
      id: "l2",
      elements: [
        { kind: "title", text: "Collections reached SGD 195,200 by October" },
        NOTE,
        SLIDES_CHANGE_FIGURE,
      ],
    },
    {
      id: "l3",
      elements: [
        { kind: "title", text: "Invoiced sales rose in four of six months" },
        NOTE,
        invoicedChart,
      ],
    },
    {
      id: "l4",
      elements: [
        { kind: "title", text: "Collections held steady across the quarter" },
        NOTE,
        SLIDES_CHANGE_FIGURE,
        SLIDES_CHANGE_FIGURE,
      ],
    },
    {
      id: "l5",
      elements: [
        { kind: "title", text: "Collections trail invoiced sales every month" },
        NOTE,
        invoicedChart,
        collectedChart,
      ],
    },
    {
      id: "l6",
      elements: [
        { kind: "title", text: "Five customers paid late this quarter" },
        {
          kind: "text",
          text: "Most late payments settled within two weeks of the due date.",
        },
        {
          kind: "table",
          chart: LATE_CUSTOMERS,
          data: {
            kind: "table",
            title: "Customers who paid late",
            columns: [
              { key: "customerName", label: "Customer", type: "text" },
              { key: "invoiceNumber", label: "Invoice", type: "text" },
              { key: "dueDate", label: "Due", type: "date" },
            ],
            rows: LATE_ROWS.map(([customerName, invoiceNumber, dueDate]) => ({
              customerName,
              invoiceNumber,
              dueDate,
            })),
            datasets: ["invoices.invoices"],
            sources: ["Invoices"],
            readAt: READ_AT,
            truncated: false,
          },
        },
      ],
    },
    {
      id: "l7",
      elements: [
        { kind: "title", text: "Five steps keep collections on the plan line" },
        {
          kind: "bullets",
          items: [
            "Chase the three customers whose balances run past their terms.",
            "Move the two largest accounts to thirty day terms.",
            "Send every reminder on the due date.",
            "Report collected cash beside invoiced sales each month.",
            "Review the open balances with the sales leads every Monday.",
          ],
        },
      ],
    },
    {
      id: "l8",
      elements: [
        { kind: "title", text: "The quarter closed without an open dispute" },
        {
          kind: "text",
          text: "Every disputed invoice was settled before the end of September.",
        },
      ],
    },
  ],
} as const;

/** The comparison slide: two line charts beside a text, at the 225 x 292 pair box. */
export const DECK_LOOK_CHART_SLIDE = 5;

/** A dark theme as a deck stores it, which the export test sets directly. */
export const DECK_LOOK_DARK_THEME = {
  background: "#030712",
  text: "#F3F4F6",
  secondaryText: "#9CA3AF",
  accent: "#60A5FA",
  weight: "regular",
  layout: "light",
  logo: "dark",
} as const;

/** The theme request that `slides-theme-1` to `-3` answer on the fixed deck of `slides-change.ts`. */
export const SLIDES_THEME_MESSAGE = "Make this deck dark and minimal.";

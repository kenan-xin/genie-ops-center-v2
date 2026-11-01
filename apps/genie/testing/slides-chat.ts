/**
 * The chat deck beside the Slides list that the app integration test and the dev e2e share (Spec 7
 * R-46, R-56, D12). The recorded model requests hold these values, so a change here re-records
 * `slides-create-deck-1.json` and `-2.json`. The five slides follow the demo pack's prompt; each
 * title states the finding its own figure, chart or table shows (ruling F15).
 */

/** The keys of the person who chats beside the Slides list. */
export const SLIDES_CHAT_KEYS = [
  "core:ask:use",
  "slides:use",
  "slides:read",
  "slides:write",
  "invoices:use",
  "invoices:read",
] as const;

export const SLIDES_CHAT_MESSAGE =
  "Create five slides: monthly sales, collections, overdue customers, payment behaviour and collection priorities.";

const MAY_TO_OCTOBER = (field: string) =>
  [{ field, op: "between", from: "2026-05-01", to: "2026-10-31" }] as const;

const OVERDUE = [{ field: "overdue", op: "eq", value: true }] as const;

const OUTSTANDING = [
  { fn: "sum", field: "outstandingCents", as: "total" },
] as const;

const kpi = (
  title: string,
  query: {
    readonly filters?: typeof OVERDUE;
    readonly aggregates: typeof OUTSTANDING;
  }
) =>
  ({
    type: "kpi",
    title,
    series: [
      { name: title, dataset: "invoices.invoices", query, value: "total" },
    ],
  }) as const;

const INVOICED_SERIES = {
  name: "Invoiced sales",
  dataset: "invoices.invoices",
  query: {
    filters: MAY_TO_OCTOBER("invoiceDate"),
    groupBy: [{ field: "invoiceDate", bucket: "month" }],
    aggregates: [{ fn: "sum", field: "totalCents", as: "invoicedCents" }],
  },
  x: "invoiceDate",
  y: "invoicedCents",
} as const;

/** The deck the recorded tool call creates, as the `slides-create-deck` arguments. */
export const MONTHLY_DECK = {
  title: "Monthly sales and collections",
  slides: [
    {
      elements: [
        {
          kind: "title",
          text: "Invoiced sales grew every month from May to October.",
        },
        { kind: "text", text: "October invoiced sales reached SGD 43,900.00." },
        {
          kind: "chart",
          chart: {
            type: "bar",
            title: "Invoiced sales by month",
            series: [INVOICED_SERIES],
          },
        },
      ],
    },
    {
      elements: [
        {
          kind: "title",
          text: "Collections fell behind invoiced sales in September and October.",
        },
        {
          kind: "chart",
          // The Chart of the recorded answer `model-recordings/monthly-invoiced-and-collected.json`.
          chart: {
            type: "bar",
            title: "Invoiced sales and collections by month",
            series: [
              INVOICED_SERIES,
              {
                name: "Collections",
                dataset: "invoices.payments",
                query: {
                  filters: MAY_TO_OCTOBER("paymentDate"),
                  groupBy: [{ field: "paymentDate", bucket: "month" }],
                  aggregates: [
                    { fn: "sum", field: "amountCents", as: "collectedCents" },
                  ],
                },
                x: "paymentDate",
                y: "collectedCents",
              },
            ],
          },
        },
      ],
    },
    {
      elements: [
        {
          kind: "title",
          text: "Harbor Foods, Orchid Retail and ABC Trading hold every overdue balance.",
        },
        {
          kind: "chart",
          chart: {
            type: "bar",
            title: "Overdue balance by customer",
            series: [
              {
                name: "Overdue",
                dataset: "invoices.invoices",
                query: {
                  filters: OVERDUE,
                  groupBy: [{ field: "customerName" }],
                  aggregates: [
                    {
                      fn: "sum",
                      field: "outstandingCents",
                      as: "overdueCents",
                    },
                  ],
                },
                x: "customerName",
                y: "overdueCents",
              },
            ],
          },
        },
        {
          kind: "figure",
          chart: kpi("Overdue", { filters: OVERDUE, aggregates: OUTSTANDING }),
        },
      ],
    },
    {
      elements: [
        {
          kind: "title",
          text: "ABC Trading, Harbor Foods and Orchid Retail paid most settled invoices late.",
        },
        {
          kind: "table",
          chart: {
            type: "table",
            title: "Late payments by customer",
            series: [
              {
                name: "Late payments",
                dataset: "invoices.customers",
                query: {
                  select: ["name", "settledWithDueDateCount", "paidLateCount"],
                  orderBy: [{ column: "paidLateCount", direction: "desc" }],
                  limit: 12,
                },
              },
            ],
          },
        },
      ],
    },
    {
      elements: [
        {
          kind: "title",
          text: "Follow up the largest overdue balances first.",
        },
        {
          kind: "bullets",
          items: [
            "Start with Harbor Foods, the largest overdue balance.",
            "Ask Orchid Retail for the due dates of its open invoices.",
            "Agree a payment plan with ABC Trading.",
          ],
        },
        {
          kind: "figure",
          chart: kpi("Outstanding", { aggregates: OUTSTANDING }),
        },
      ],
    },
  ],
} as const;

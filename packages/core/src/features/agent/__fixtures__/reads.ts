import type {
  AgentMessage,
  ChatLabels,
} from "../../../services/agent/index.ts";

/** The labels of the example items, as `chatLabels` answers them for a reader. */
export const READ_LABELS: ChatLabels = {
  steps: {},
  datasets: { "example.items": "Items", "example.secret": "Secret items" },
  fields: {
    "example.items": {
      createdOn: { label: "Created on", type: "date" },
      amountCents: { label: "Amount", type: "money" },
    },
  },
};

const MONTHS = ["05", "06", "07", "08", "09", "10"];

/** A grouped sum of the example items by month: six rows, one per month. */
export const GROUPED_READ: AgentMessage["parts"][number] = {
  type: "tool-query-dataset",
  toolCallId: "call-by-month",
  state: "output-available",
  input: {
    dataset: "example.items",
    query: {
      filters: [
        {
          field: "createdOn",
          op: "between",
          from: "2026-05-01",
          to: "2026-10-27",
        },
      ],
      groupBy: [{ field: "createdOn", bucket: "month" }],
      aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
    },
  },
  output: {
    dataset: "example.items",
    asOf: "2026-10-27",
    columns: [
      { name: "createdOn", type: "date", bucket: "month" },
      { name: "total", type: "money", currency: "SGD" },
    ],
    rows: MONTHS.map((month, index) => ({
      createdOn: `2026-${month}-01`,
      total: 100_000 * (index + 1),
    })),
    truncated: false,
  },
};

/** The sentence of `GROUPED_READ` with `READ_LABELS`. */
export const GROUPED_SENTENCE =
  "Added up Amount of the items with Created on from 1 May 2026 to 27 Oct 2026, grouped by month of Created on.";

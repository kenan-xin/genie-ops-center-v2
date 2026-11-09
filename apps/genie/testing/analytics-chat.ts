/**
 * The chat change on a dashboard that the app integration test and the dev e2e share (Spec 7
 * R-46, R-49, D12) and demo step 9, and the dashboard handoff and the add-as-panel question
 * (R-42b, R-46 amended, AC-13). The recorded and synthetic model requests hold these values, so a
 * change here re-keys `dashboard-unallocated-*` and `synthetic-dashboard-*`.
 */

/** The keys of the person who chats beside the dashboard. */
export const ANALYTICS_CHAT_KEYS = [
  "core:ask:use",
  "analytics:use",
  "analytics:read",
  "analytics:write",
  "invoices:use",
  "invoices:read",
  "invoices:write",
] as const;

/** A fixed id, so the recorded requests match on every run (D12). */
export const ANALYTICS_CHAT_DASHBOARD = {
  id: "5f0c2d4e-8a1b-4c3d-9e7f-0a0a0a0a0001",
  name: "Collections watch",
} as const;

// The Receivables overview starter already has a Collections KPI, so the demo asks for one it
// lacks (`czjw.75`).
export const ANALYTICS_CHAT_MESSAGE =
  "Add a KPI panel named Unallocated payments that shows the total of payments not yet linked to an invoice.";

/**
 * The panel that the chat adds, as a `toMatchObject` pattern: the series name and the aggregate's
 * alias are the model's choice.
 */
export const UNALLOCATED_PANEL = {
  type: "kpi",
  title: "Unallocated payments",
  series: [
    {
      dataset: "invoices.payments",
      query: { aggregates: [{ fn: "sum", field: "unallocatedCents" }] },
    },
  ],
} as const;

/** Ask's message that `synthetic-dashboard-handoff-1` hands over, and the brief's title. */
export const ANALYTICS_HANDOFF_MESSAGE =
  "Build a Receivables watch dashboard with the unallocated payments, the monthly collections and the overdue balances by customer.";

export const ANALYTICS_HANDOFF_TITLE = "Receivables watch";

/** The three panels that `synthetic-dashboard-build-1` to `-3` add, one per call, in order. */
export const HANDOFF_PANEL_TITLES = [
  "Unallocated payments",
  "Monthly collections (SGD)",
  "Overdue balances by customer (SGD)",
] as const;

/** The empty dashboard of the question, and the chart request that names no place for the chart. */
export const QUESTION_DASHBOARD_NAME = "Collections";

export const ANALYTICS_QUESTION_MESSAGE = "Show me the collections by month.";

/** The question of `synthetic-dashboard-question-2`, and the person's two answers. */
export const ANALYTICS_QUESTION =
  "Add this as a panel to Collections, or just show it here?";

export const ANALYTICS_ADD_ANSWER = "Add";

export const ANALYTICS_SHOW_ANSWER = "Just show it here";

/** The collections figure of slide `s2` in `slides-change.ts`. */
export const COLLECTIONS_PANEL = {
  type: "kpi",
  title: "Collections",
  series: [
    {
      name: "Collections",
      dataset: "invoices.payments",
      query: {
        aggregates: [{ fn: "sum", field: "amountCents", as: "collections" }],
      },
      value: "collections",
    },
  ],
} as const;

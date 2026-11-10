/**
 * The chat change on a dashboard that the app integration test and the dev e2e share (Spec 7
 * R-46, R-49, D12) and demo step 9, and the dashboard handoff and the add-as-panel question
 * (R-42b, R-46 amended, AC-13). The recorded model requests hold these values, so a change here
 * re-keys `dashboard-*` and `out-of-tools-*`.
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

/** Ask's message that `dashboard-handoff-2` hands over, and the brief's title. */
export const ANALYTICS_HANDOFF_MESSAGE =
  "Build a Receivables watch dashboard with the unallocated payments, the monthly collections and the overdue balances by customer.";

export const ANALYTICS_HANDOFF_TITLE = "Receivables watch";

/** The three panels that `dashboard-build-3` to `-5` add, one per call, in order. */
export const HANDOFF_PANEL_TITLES = [
  "Unallocated payments above zero",
  "Monthly collections by currency",
  "Overdue balances by customer and currency",
] as const;

/** The empty dashboard of the question, and the chart request that names no place for the chart. */
export const QUESTION_DASHBOARD_NAME = "Collections";

export const ANALYTICS_QUESTION_MESSAGE = "Show me the collections by month.";

/** The question of `dashboard-question-1`, and the two answers that the person types. */
export const ANALYTICS_QUESTION =
  "Would you like collections by month added to this dashboard or shown here?";

/** The chart that both answers make, as a panel (Add) or as an artifact (Just show it here). */
export const ANALYTICS_CHART_TITLE = "Collections by month (SGD)";

export const ANALYTICS_ADD_ANSWER = "Add";

export const ANALYTICS_SHOW_ANSWER = "Just show it here";

/**
 * A request outside the tools in Ask and on a dashboard, and the one-sentence answers of
 * `out-of-tools-ask-2` and `out-of-tools-dashboard-2` (R-46a, S7-44).
 */
export const OUT_OF_TOOLS_ASK_MESSAGE = "Change the logo of this workspace.";

export const OUT_OF_TOOLS_ASK_ANSWER =
  "I can’t change the workspace logo, but I can help build a dashboard instead.";

export const OUT_OF_TOOLS_DASHBOARD_MESSAGE =
  "Make the panel titles bigger and blue.";

export const OUT_OF_TOOLS_DASHBOARD_ANSWER =
  "I can rename panel titles, but I can’t change their size or colour; would you like to rename them instead?";

/**
 * The filter request of `dashboard-filters-1`, the filters the one `set-filters` step of `-3`
 * saves, and the answer of `-4` (S7-46, R-49). One company is a select; a text field takes either.
 */
export const ANALYTICS_FILTER_MESSAGE =
  "Show only Demo Company and the last 3 months.";

export const ANALYTICS_FILTERS = {
  dateRange: { preset: "last-3-months" },
  fields: [
    {
      kind: "select",
      field: "customerName",
      label: "Customer",
      value: "Demo Company",
    },
  ],
} as const;

export const ANALYTICS_FILTER_ANSWER =
  "Collections watch is filtered to Demo Company and the last 3 months.";

/**
 * The view request of `dashboard-view-1`, the view that the `save-view` step of `-2` saves as `v1`
 * with the dashboard's own filters, and that its `set-default-view` step makes the default in the
 * same change, and the answer of `-3` (S7-47, R-49a).
 */
export const ANALYTICS_VIEW_MESSAGE =
  "Save this as a view called Month end and open the dashboard with it.";

export const ANALYTICS_VIEW = {
  id: "v1",
  name: "Month end",
  filters: { dateRange: { preset: "all" }, fields: [] },
} as const;

export const ANALYTICS_VIEW_ANSWER =
  "Saved Month end as the default view for Collections watch.";

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

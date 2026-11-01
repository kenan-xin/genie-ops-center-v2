/**
 * The chat change on a dashboard that the app integration test and the dev e2e share (Spec 7
 * R-46, R-49, D12). The recorded model requests hold these values, so a change here re-records
 * `analytics-add-collections-1.json` to `-4.json`.
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

export const ANALYTICS_CHAT_MESSAGE =
  "Add a KPI panel named Collections that shows the total of all payments.";

/** The panel the recorded tool call adds. */
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

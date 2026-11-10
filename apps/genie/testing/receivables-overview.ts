import type { PanelConfig } from "@genie/core";
import type { DashboardConfig } from "@genie/module-analytics/testing";

/**
 * The Receivables overview starter dashboard that the demo seed writes for the demo account
 * (Spec 7 R-51). It lives in the app, because the analytics module imports no other module and
 * every panel reads an invoices dataset. Each panel passes the chart gate as the demo account
 * (`seed-demo.integration.test.ts`); the seed itself writes it with no gate (plan D11).
 */
const sum = (field: string) => [{ fn: "sum", field, as: "total" }] as const;

const kpi = (
  title: string,
  dataset: string,
  query: PanelConfig["series"][number]["query"]
) =>
  ({
    type: "kpi",
    title,
    series: [{ name: title, dataset, query, value: "total" }],
  }) as const;

const OVERDUE = [{ field: "overdue", op: "eq", value: true }] as const;

const config: DashboardConfig = {
  views: [],
  defaultViewId: null,
  filters: {
    dateRange: { preset: "all" },
    fields: [
      { kind: "select", field: "customerName", label: "Customer", value: null },
    ],
  },
  panels: [
    {
      id: "p1",
      layout: { columns: 1, rows: 1 },
      config: kpi("Invoiced sales", "invoices.invoices", {
        aggregates: sum("totalCents"),
      }),
    },
    {
      id: "p2",
      layout: { columns: 1, rows: 1 },
      config: kpi("Collections", "invoices.payments", {
        aggregates: sum("amountCents"),
      }),
    },
    {
      id: "p3",
      layout: { columns: 1, rows: 1 },
      config: kpi("Outstanding", "invoices.invoices", {
        aggregates: sum("outstandingCents"),
      }),
    },
    {
      id: "p4",
      layout: { columns: 1, rows: 1 },
      config: kpi("Overdue", "invoices.invoices", {
        filters: OVERDUE,
        aggregates: sum("outstandingCents"),
      }),
    },
    {
      id: "p5",
      layout: { columns: 4, rows: 2 },
      // The chart of the earlier hand-written monthly answer; the live answer now draws its own
      // (`model-recordings/monthly-invoiced-and-collected-3.json`).
      config: {
        type: "bar",
        title: "Invoiced sales and collections by month",
        series: [
          {
            name: "Invoiced sales",
            dataset: "invoices.invoices",
            query: {
              filters: [
                {
                  field: "invoiceDate",
                  op: "between",
                  from: "2026-05-01",
                  to: "2026-10-31",
                },
              ],
              groupBy: [{ field: "invoiceDate", bucket: "month" }],
              aggregates: [
                { fn: "sum", field: "totalCents", as: "invoicedCents" },
              ],
            },
            x: "invoiceDate",
            y: "invoicedCents",
          },
          {
            name: "Collections",
            dataset: "invoices.payments",
            query: {
              filters: [
                {
                  field: "paymentDate",
                  op: "between",
                  from: "2026-05-01",
                  to: "2026-10-31",
                },
              ],
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
    {
      id: "p6",
      layout: { columns: 2, rows: 2 },
      config: {
        type: "bar",
        title: "Overdue ageing",
        series: [
          {
            name: "Overdue",
            dataset: "invoices.invoices",
            query: {
              filters: OVERDUE,
              groupBy: [
                {
                  field: "daysOverdue",
                  ranges: [
                    { label: "1 to 30 days", min: 1, max: 31 },
                    { label: "31 to 60 days", min: 31, max: 61 },
                    { label: "61 to 90 days", min: 61, max: 91 },
                    { label: "Over 90 days", min: 91 },
                  ],
                },
              ],
              aggregates: [
                { fn: "sum", field: "outstandingCents", as: "overdueCents" },
              ],
            },
            x: "daysOverdue",
            y: "overdueCents",
          },
        ],
      },
    },
  ],
};

export const RECEIVABLES_OVERVIEW = { name: "Receivables overview", config };

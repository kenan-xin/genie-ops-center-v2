/**
 * Deterministic English fixtures for the Invoices list stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant. They are not seed
 * data and they never reach a runtime path.
 */
import type { InvoiceListRow, InvoiceListView } from "../views.ts";

const PAID: InvoiceListRow = {
  id: "11111111-1111-4111-8111-111111111111",
  invoiceNumber: "INV-2026-09-01",
  customerName: "Harbourline Trading",
  invoiceDate: "2026-09-01",
  dueDate: "2026-09-15",
  currency: "SGD",
  totalCents: 720_000,
  outstandingCents: 0,
  status: { kind: "paid" },
};

const OPEN: InvoiceListRow = {
  id: "22222222-2222-4222-8222-222222222222",
  invoiceNumber: "INV-2026-10-02",
  customerName: "Kestrel Logistics",
  invoiceDate: "2026-10-02",
  dueDate: "2026-11-01",
  currency: "SGD",
  totalCents: 520_000,
  outstandingCents: 520_000,
  status: { kind: "open" },
};

const OVERDUE: InvoiceListRow = {
  id: "33333333-3333-4333-8333-333333333333",
  invoiceNumber: "INV-2026-09-03",
  customerName: "Marina Bay Interiors",
  invoiceDate: "2026-09-07",
  dueDate: "2026-09-17",
  currency: "SGD",
  totalCents: 500_000,
  outstandingCents: 300_000,
  status: { kind: "overdue", daysOverdue: 40 },
};

const NO_DUE_DATE: InvoiceListRow = {
  id: "44444444-4444-4444-8444-444444444444",
  invoiceNumber: "INV-2026-09-04",
  customerName: "Orchard Print Works",
  invoiceDate: "2026-09-20",
  dueDate: null,
  currency: "SGD",
  totalCents: 435_000,
  outstandingCents: 435_000,
  status: { kind: "no-due-date" },
};

const US_DOLLARS: InvoiceListRow = {
  id: "55555555-5555-4555-8555-555555555555",
  invoiceNumber: "INV-2026-10-05",
  customerName: "Cedar Point Studio",
  invoiceDate: "2026-10-05",
  dueDate: "2026-11-05",
  currency: "USD",
  totalCents: 125_000,
  outstandingCents: 125_000,
  status: { kind: "open" },
};

export const defaultInvoiceList: InvoiceListView = {
  asOf: "2026-10-27",
  rows: [PAID, OPEN, OVERDUE, NO_DUE_DATE],
  truncated: false,
};

export const twoCurrencyInvoiceList: InvoiceListView = {
  ...defaultInvoiceList,
  rows: [...defaultInvoiceList.rows, US_DOLLARS],
};

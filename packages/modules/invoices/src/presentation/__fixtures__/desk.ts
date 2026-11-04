import type { DeskField } from "../desk-canvas.tsx";
import type { RecordField } from "../views.ts";

/**
 * The history invoice INV-2026-09-03 on the document desk (prototype variant C). Six fields carry
 * the quotes that the demo seed stores; Payment terms was corrected by a person, so it has no pin.
 */
export const DESK_FIELDS_0903: readonly DeskField[] = [
  {
    key: "customer",
    label: "Customer",
    value: "Harbor Foods",
    tag: "extracted",
    source: { page: 1, quote: "Bill to: Harbor Foods" },
  },
  {
    key: "number",
    label: "Invoice number",
    value: "INV-2026-09-03",
    tag: "extracted",
    source: { page: 1, quote: "Invoice number INV-2026-09-03" },
  },
  {
    key: "date",
    label: "Invoice date",
    value: "3 Sept 2026",
    tag: "extracted",
    source: { page: 1, quote: "Invoice date 2026-09-03" },
  },
  {
    key: "dueDate",
    label: "Due date",
    value: "17 Sept 2026",
    tag: "extracted",
    source: { page: 1, quote: "Payment due date 2026-09-17" },
  },
  {
    key: "description",
    label: "Description",
    value: "Operations support services - September 2026",
    tag: "extracted",
    source: { page: 1, quote: "Operations support services - September 2026" },
  },
  {
    key: "amount",
    label: "Total",
    value: "SGD 7,200.00",
    tag: "extracted",
    source: { page: 1, quote: "TOTAL (SGD) 7,200.00" },
  },
  {
    key: "paymentTerms",
    label: "Payment terms",
    value: "Payment due within 14 days of invoice date.",
    tag: "corrected",
    source: null,
  },
];

/** What the closed phone sheet of INV-2026-09-03 shows at the reporting date. */
export const DESK_PEEK_0903 = {
  status: "Overdue · 40 days",
  caption: "Outstanding · Harbor Foods",
  amount: "SGD 2,200.00",
} as const;

/** The same seven fields as the record view answers them, before the page maps them. */
export const RECORD_FIELDS_0903: readonly RecordField[] = [
  {
    field: "amount",
    origin: "extracted",
    quote: "TOTAL (SGD) 7,200.00",
    page: 1,
  },
  {
    field: "customer",
    origin: "extracted",
    quote: "Bill to: Harbor Foods",
    page: 1,
  },
  {
    field: "date",
    origin: "extracted",
    quote: "Invoice date 2026-09-03",
    page: 1,
  },
  {
    field: "description",
    origin: "extracted",
    quote: "Operations support services - September 2026",
    page: 1,
  },
  {
    field: "dueDate",
    origin: "extracted",
    quote: "Payment due date 2026-09-17",
    page: 1,
  },
  {
    field: "number",
    origin: "extracted",
    quote: "Invoice number INV-2026-09-03",
    page: 1,
  },
  {
    field: "paymentTerms",
    origin: "corrected",
    quote: "Payment due within 14 days of invoice date.",
    page: 1,
  },
];

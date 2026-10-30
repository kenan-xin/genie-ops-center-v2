import { type ModuleRequestContext, queryDataset } from "@genie/core";
import { z } from "zod";

import type {
  InvoiceListRow,
  InvoiceListView,
} from "../../presentation/views.ts";
import { invoiceStatusOf } from "./status.ts";

/** The fields the list reads from one dataset row, as the dataset answers them. */
const listRow = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  customerName: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  currency: z.string(),
  totalCents: z.number().int(),
  outstandingCents: z.number().int(),
  overdue: z.boolean(),
  daysOverdue: z.number().int().nullable(),
});

/**
 * The Invoices list as of the reporting date: one `queryDataset` read under `invoices:read`, so a
 * scoped person sees only the customers they may read (DEC-39, R-9, R-36).
 *
 * shortcut: at most 1,000 rows (DATASET_ROW_CAP); page past it with czjw.28
 */
export async function loadInvoiceList(
  ctx: ModuleRequestContext
): Promise<InvoiceListView> {
  const result = await queryDataset(ctx, {
    dataset: "invoices.invoices",
    query: {
      select: [
        "id",
        "invoiceNumber",
        "customerName",
        "invoiceDate",
        "dueDate",
        "currency",
        "totalCents",
        "outstandingCents",
        "overdue",
        "daysOverdue",
      ],
      orderBy: [
        { column: "invoiceDate", direction: "desc" },
        { column: "invoiceNumber", direction: "desc" },
      ],
    },
  });

  const rows: InvoiceListRow[] = result.rows.map((row) => {
    const value = listRow.parse(row);

    return {
      id: value.id,
      invoiceNumber: value.invoiceNumber,
      customerName: value.customerName,
      invoiceDate: value.invoiceDate,
      dueDate: value.dueDate,
      currency: value.currency,
      totalCents: value.totalCents,
      outstandingCents: value.outstandingCents,
      status: invoiceStatusOf(value),
    };
  });

  return { asOf: result.asOf, rows, truncated: result.truncated };
}

import type { Module } from "@genie/core";
import { sql } from "drizzle-orm";

import { customer, invoice, payment } from "./schema.ts";

export const RECORD_TYPES = {
  invoice: "invoices-invoice",
  payment: "invoices-payment",
  customer: "invoices-customer",
} as const;

/**
 * The module's record types. An invoice and a payment name their customer as parent, so a grant
 * on one customer covers its records. Each resolver compares the id as text, so an id that is not
 * a uuid finds nothing instead of failing.
 */
export const invoicesRecordTypes: Module["recordTypes"] = [
  {
    type: RECORD_TYPES.customer,
    resolve: async (ctx, id) => {
      const [row] = await ctx.tenant.db
        .select({ name: customer.name })
        .from(customer)
        .where(sql`${customer.id}::text = ${id}`);

      return row && { label: row.name };
    },
  },
  {
    type: RECORD_TYPES.invoice,
    parentTypes: [RECORD_TYPES.customer],
    resolve: async (ctx, id) => {
      const [row] = await ctx.tenant.db
        .select({ number: invoice.number, customerId: invoice.customerId })
        .from(invoice)
        .where(sql`${invoice.id}::text = ${id}`);

      return (
        row && {
          label: row.number,
          path: `/m/invoices/invoices/${id}`,
          parents: [{ type: RECORD_TYPES.customer, id: row.customerId }],
        }
      );
    },
  },
  {
    type: RECORD_TYPES.payment,
    parentTypes: [RECORD_TYPES.customer],
    resolve: async (ctx, id) => {
      const [row] = await ctx.tenant.db
        .select({
          reference: payment.reference,
          paymentDate: payment.paymentDate,
          customerId: payment.customerId,
        })
        .from(payment)
        .where(sql`${payment.id}::text = ${id}`);

      return (
        row && {
          label: `Payment ${row.reference ?? row.paymentDate}`,
          path: `/m/invoices/payments/${id}`,
          parents: [{ type: RECORD_TYPES.customer, id: row.customerId }],
        }
      );
    },
  },
];

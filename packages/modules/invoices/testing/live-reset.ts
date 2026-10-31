import { type TenantContext, withTransaction } from "@genie/core";
import { sql } from "drizzle-orm";

/**
 * Test only: deletes, in one transaction, the link events, the links, the payments and the invoices saved
 * from documents whose file name starts with `prefix`. The product never deletes ledger rows (P15).
 *
 * The rows go in foreign-key order: an event and a link name their invoice and payment, so both
 * are gone before the payment and the invoice. A document stays, because a document is not a
 * ledger row and a later upload of the same bytes is still a duplicate.
 */
export async function removeUploadRecords(
  tenant: TenantContext,
  prefix: string
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    // The documents this test run uploaded. Its saved rows all point at one of them.
    const saved = sql`(select id from "document" where starts_with(file_name, ${prefix}))`;

    await tx.execute(sql`
      delete from allocation_event
      where invoice_id in (select id from invoice where document_id in ${saved})
         or payment_id in (select id from payment where document_id in ${saved})
    `);
    await tx.execute(sql`
      delete from allocation
      where invoice_id in (select id from invoice where document_id in ${saved})
         or payment_id in (select id from payment where document_id in ${saved})
    `);
    await tx.execute(sql`delete from payment where document_id in ${saved}`);
    await tx.execute(sql`delete from invoice where document_id in ${saved}`);
  });
}

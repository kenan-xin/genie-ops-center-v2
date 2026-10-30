import {
  AppError,
  CORE_ERRORS,
  moduleAudit,
  type ModuleRequestContext,
  type RequestPrincipal,
  type TenantContext,
  type TenantTransaction,
} from "@genie/core";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";

import type { customerChoice } from "../../contract.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { customer } from "../../schema.ts";
import { assertCanWrite, assertCanWriteEverywhere } from "./access.ts";

export type CustomerChoice = z.infer<typeof customerChoice>;

const audit = moduleAudit("invoices");

/** The rule of the unique index `customer_name_key`: case and outer spaces do not count. */
const sameName = (name: string) =>
  sql`lower(btrim(${customer.name})) = lower(btrim(${name}))`;

export async function findCustomerByName(
  db: TenantContext["db"] | TenantTransaction,
  name: string
): Promise<{ readonly id: string; readonly name: string } | undefined> {
  const [row] = await db
    .select({ id: customer.id, name: customer.name })
    .from(customer)
    .where(sameName(name));

  return row;
}

/** A chosen customer needs a write grant on it. A new one needs a tenant-wide grant (decision 13). */
export async function authorizeCustomer(
  caller: RequestPrincipal,
  choice: CustomerChoice
): Promise<void> {
  await ("id" in choice
    ? assertCanWrite(caller, [{ type: RECORD_TYPES.customer, id: choice.id }])
    : assertCanWriteEverywhere(caller));
}

/**
 * Locks the chosen customer row, the first lock of every write. A confirmed new name is created,
 * or, when that name already exists, the existing row is locked and reused.
 */
export async function lockCustomer(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  choice: CustomerChoice
): Promise<{ readonly customerId: string; readonly created: boolean }> {
  if ("id" in choice) {
    const [row] = await tx
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.id, choice.id))
      .for("update");

    if (row === undefined) throw new AppError(CORE_ERRORS["not-found"]);

    return { customerId: row.id, created: false };
  }

  const [created] = await tx
    .insert(customer)
    .values({ name: choice.name, email: choice.email })
    .onConflictDoNothing()
    .returning({ id: customer.id });

  if (created !== undefined) {
    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "invoices:customer-created",
      { type: RECORD_TYPES.customer, id: created.id },
      "Created a customer."
    );

    return { customerId: created.id, created: true };
  }

  const [existing] = await tx
    .select({ id: customer.id })
    .from(customer)
    .where(sameName(choice.name))
    .for("update");

  // The insert met the unique name, so the row exists; a customer is never deleted.
  if (existing === undefined)
    throw new Error("the conflicting customer is gone");

  return { customerId: existing.id, created: false };
}

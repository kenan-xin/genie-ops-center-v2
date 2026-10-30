import {
  AppError,
  can,
  CORE_ERRORS,
  type RequestPrincipal,
  type ResourceRef,
  scopesFor,
} from "@genie/core";

/**
 * Refuses the write unless the caller holds `invoices:write` on every record it changes. Each
 * record goes to `can()`, so a grant scoped to one customer covers only that customer's records
 * (decision 13).
 */
export async function assertCanWrite(
  caller: RequestPrincipal,
  records: readonly ResourceRef[]
): Promise<void> {
  const allowed = await Promise.all(
    records.map((record) => can(caller, "invoices:write", record))
  );

  if (!allowed.every(Boolean)) throw new AppError(CORE_ERRORS.forbidden);
}

/** Refuses a read that no single record covers, such as the documents inbox, without a tenant-wide grant. */
export async function assertCanReadEverywhere(
  caller: RequestPrincipal
): Promise<void> {
  if ((await scopesFor(caller, "invoices:read")).kind !== "all") {
    throw new AppError(CORE_ERRORS.forbidden);
  }
}

/** Refuses a write that no single record covers, such as a new customer, without a tenant-wide grant. */
export async function assertCanWriteEverywhere(
  caller: RequestPrincipal
): Promise<void> {
  if ((await scopesFor(caller, "invoices:write")).kind !== "all") {
    throw new AppError(CORE_ERRORS.forbidden);
  }
}

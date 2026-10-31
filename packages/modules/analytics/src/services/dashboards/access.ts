import { AppError, can, CORE_ERRORS, type RequestPrincipal } from "@genie/core";

/**
 * A dashboard is not a record type, so no role scope can point at one (D7, D8). Each check asks
 * `can()` for the tenant-wide key with no resource; the store then reads the caller's own rows.
 */
export async function assertCanRead(caller: RequestPrincipal): Promise<void> {
  if (!(await can(caller, "analytics:read"))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }
}

export async function assertCanWrite(caller: RequestPrincipal): Promise<void> {
  if (!(await can(caller, "analytics:write"))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }
}

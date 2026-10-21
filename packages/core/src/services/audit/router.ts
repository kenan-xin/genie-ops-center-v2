import type { Module } from "../../lib/module-contract/module.ts";
import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { type AuditFilterInput, auditContract } from "./contract.ts";
import {
  type AuditDateRange,
  type AuditEventFilters,
  readAuditPage,
} from "./reader.ts";

const DEFAULT_PAGE_SIZE = 50;

/** Applies the reader's defaults to whatever the caller sent; absent means "no narrowing". */
function normalizeFilters(
  raw: AuditFilterInput | undefined
): AuditEventFilters {
  return {
    query: raw?.query ?? "",
    actorId: raw?.actorId ?? "all",
    action: raw?.action ?? "all",
    targetType: raw?.targetType ?? "all",
    range: (raw?.range ?? "30d") satisfies AuditDateRange,
    from: raw?.from ?? null,
    to: raw?.to ?? null,
    operatorOnly: raw?.operatorOnly ?? false,
  };
}

// The session check runs before input is parsed, so an anonymous, idle-expired or capped request
// answers `unauthenticated` at 401 however malformed its cursor is; only then does the reader call
// `can()` and read (Spec 2 R-14, R-67).
const os = implementCoreArea(auditContract);

/**
 * The audit reader's one router (R-67 to R-69), mounted by the application under `audit`. It
 * carries no entitlement gate: `core:audit:read` is a core key, not a module's, and the reader
 * refuses through `can()` inside the service (DEC-39). `list` is a read, because the screen never
 * writes an event: no row is editable and no row is deletable. The compiled record types it
 * resolves target links through are closed over rather than read from a registry core cannot
 * import (R-39).
 *
 * The cursor is not signed: a viewer holding `core:audit:read` may read every row anyway, so a
 * fabricated position reaches nothing they could not read from page one. Its shape is validated
 * so a malformed value is a bounded input error, not a cast failure.
 */
export function createAuditRouter(
  modules: readonly Pick<Module, "identity" | "permissions" | "recordTypes">[]
) {
  return os.router({
    list: os.list.handler(({ context, input }) => {
      const cursor = input.cursor ?? null;

      return readAuditPage({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        filters: normalizeFilters(input.filters),
        cursor,
        limit: input.limit ?? DEFAULT_PAGE_SIZE,
        // The total and the filter lists are full-history aggregates, so only page one asks.
        includeFacets: cursor === null,
      });
    }),
  });
}

export type AuditRouter = ReturnType<typeof createAuditRouter>;

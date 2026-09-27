import { initTRPC } from "@trpc/server";
import { z } from "zod";

import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { RequestPrincipal } from "../authorization/index.ts";
import {
  type AuditDateRange,
  type AuditEventFilters,
  readAuditPage,
} from "./reader.ts";

/**
 * What an audit procedure reads: the one tenant context and the request's own principal. The
 * router is built by `createAuditRouter`, so the compiled record types it resolves target links
 * through are closed over rather than read from a registry core cannot import (R-39).
 */
export type AuditRouterContext = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
};

const DEFAULT_PAGE_SIZE = 50;

const MAX_PAGE_SIZE = 100;

const rawFilters = z.object({
  query: z.string().max(500).optional(),
  actorId: z.string().max(200).optional(),
  action: z.string().max(200).optional(),
  targetType: z.string().max(200).optional(),
  range: z.enum(["today", "7d", "30d", "custom"]).optional(),
  from: z.string().max(10).nullish(),
  to: z.string().max(10).nullish(),
  operatorOnly: z.boolean().optional(),
});

const listInput = z.object({
  filters: rawFilters.optional(),
  cursor: z
    .object({ occurredAt: z.string().max(40), id: z.string().max(64) })
    .nullish(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

type RawFilters = z.infer<typeof rawFilters>;

/** Applies the reader's defaults to whatever the caller sent; absent means "no narrowing". */
function normalizeFilters(raw: RawFilters | undefined): AuditEventFilters {
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

/**
 * The audit reader's one router (R-67 to R-69), mounted by the application under its own key. It
 * carries no entitlement gate: `core:audit:read` is a core key, not a module's, and the read
 * procedure refuses through `can()` inside the service (DEC-39). `list` is a query, because the
 * screen never writes an event: no row is editable and no row is deletable.
 */
export function createAuditRouter(
  modules: readonly Pick<Module, "identity" | "permissions" | "recordTypes">[]
) {
  const t = initTRPC.context<AuditRouterContext>().create();

  return t.router({
    list: t.procedure.input(listInput).query(({ ctx, input }) =>
      readAuditPage({
        tenant: ctx.tenant,
        caller: ctx.caller,
        modules,
        filters: normalizeFilters(input.filters),
        cursor: input.cursor ?? null,
        limit: input.limit ?? DEFAULT_PAGE_SIZE,
      })
    ),
  });
}

export type AuditRouter = ReturnType<typeof createAuditRouter>;

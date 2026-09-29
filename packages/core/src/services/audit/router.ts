import { initTRPC } from "@trpc/server";
import { z } from "zod";

import { requireAuthenticated } from "../../lib/entitlement/module-trpc.ts";
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
  // A custom range is a whole day, so the transport accepts a date, not an arbitrary string.
  from: z.iso.date().nullish(),
  to: z.iso.date().nullish(),
  operatorOnly: z.boolean().optional(),
});

const listInput = z.object({
  filters: rawFilters.optional(),
  // The keyset position is validated as its real values: a time and a UUID. A malformed cursor is
  // a bounded input error from zod, never a database cast failure (R-67).
  cursor: z
    .object({ occurredAt: z.iso.datetime({ offset: true }), id: z.uuid() })
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
 *
 * The cursor is not signed: a viewer holding `core:audit:read` may read every row anyway, so a
 * fabricated position reaches nothing they could not read from page one. Its shape is validated
 * so a malformed value is a bounded input error, not a cast failure.
 */
export function createAuditRouter(
  modules: readonly Pick<Module, "identity" | "permissions" | "recordTypes">[]
) {
  const t = initTRPC.context<AuditRouterContext>().create();

  // The session check runs before `.input()` parses, so an anonymous, idle-expired or capped
  // request answers `unauthenticated` at 401 however malformed its cursor is; only then does the
  // resolver call `can()` and read (Spec 2 R-14, R-67).
  const sessionGate = t.middleware(({ ctx, next }) => {
    requireAuthenticated(ctx.caller);

    return next();
  });

  return t.router({
    list: t.procedure
      .use(sessionGate)
      .input(listInput)
      .query(({ ctx, input }) => {
        const cursor = input.cursor ?? null;

        return readAuditPage({
          tenant: ctx.tenant,
          caller: ctx.caller,
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

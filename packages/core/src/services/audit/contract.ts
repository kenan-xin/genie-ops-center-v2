import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { AuditPage } from "./reader.ts";

const MAX_PAGE_SIZE = 100;

const filters = z.object({
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

/** The filters as a caller sends them; absent means "no narrowing". */
export type AuditFilterInput = z.infer<typeof filters>;

/**
 * The audit reader's API (R-67 to R-69, ADR 0011), under core's `/audit/` area. It imports only
 * zod and the browser-safe `@genie/core/rpc` entry, so the browser client types its calls from it.
 * The answer is typed from the reader with `z.custom`, which checks nothing at run time: the
 * reader builds it, so a schema would only repeat the type.
 */
export const auditContract = {
  list: oc
    .route({ method: "GET", path: "/audit" })
    .input(
      z.object({
        filters: filters.optional(),
        // The keyset position is validated as its real values: a time and a UUID. A malformed
        // cursor is a bounded input error from zod, never a database cast failure (R-67).
        cursor: z
          .object({
            occurredAt: z.iso.datetime({ offset: true }),
            id: z.uuid(),
          })
          .nullish(),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
      })
    )
    .output(z.custom<AuditPage>()),
};

export type AuditContract = typeof auditContract;

import { oc } from "@orpc/contract";
import { z } from "zod";

/**
 * The browser-safe `@genie/core/rpc` entry (ADR 0011). A module's `contract.ts` and the app's
 * browser client import only this file, so it holds no server code: `oc` to declare a contract,
 * and the schema of the error data every refusal carries. A lint rule keeps this file to
 * `@orpc/contract` and zod. The server half (`implementModule`, `callProcedure`) is exported from
 * the core root, never from here.
 */
export { oc };

/**
 * Where the next page of a dataset row query starts (`czjw.28`): the last row's value of each
 * `orderBy` column in order, then its row key (`czjw.48`). Plain values, like the audit log's
 * cursor: a cursor only filters rows of the dataset's own scoped source, which the person may read
 * anyway. Here, so a module contract can take and answer it.
 */
export const datasetCursorSchema = z.strictObject({
  values: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .min(1)
    // At most the sort columns of a query plus its row key.
    .max(6),
});

export type DatasetCursor = z.infer<typeof datasetCursorSchema>;

/**
 * The data of every refusal the RPC transport answers: the catalogue code, the request id that
 * correlates the body with the log line (R-46), the wait of a rate-limited refusal, and the field
 * issues of a refused write (a module enable whose configuration does not parse). The app's
 * error interceptor builds it fresh, never from oRPC's own data (ADR 0011, decision 6).
 */
export const appErrorData = z.object({
  appCode: z.string(),
  requestId: z.string(),
  retryAfterMinutes: z.number().optional(),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

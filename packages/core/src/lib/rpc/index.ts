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
 * The data of every refusal the RPC transport answers: the catalogue code, the request id that
 * correlates the body with the log line (R-46), and the wait of a rate-limited refusal. The app's
 * error interceptor builds it fresh, never from oRPC's own data (ADR 0011, decision 6).
 */
export const appErrorData = z.object({
  appCode: z.string(),
  requestId: z.string(),
  retryAfterMinutes: z.number().optional(),
});

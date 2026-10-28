import { oc } from "@genie/core/rpc";
import { z } from "zod";

/** One placeholder record as the read answers it. */
const placeholderRecordOutput = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * The module's API, published as `@genie/module-placeholder/contract` (ADR 0011). It imports only
 * zod and the browser-safe `@genie/core/rpc`, so the browser client types its calls from this
 * file without pulling any server code. Every path starts with the module id (decision 7).
 */
export const placeholderContract = {
  read: oc
    .route({ method: "GET", path: "/placeholder/records" })
    .output(z.array(placeholderRecordOutput)),
  /** Enqueues `placeholder.touch-record` as the caller; `jobId` is null when pg-boss dropped it. */
  touch: oc
    .route({ method: "POST", path: "/placeholder/records/{id}/touch" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ jobId: z.string().nullable() })),
};

export type PlaceholderContract = typeof placeholderContract;

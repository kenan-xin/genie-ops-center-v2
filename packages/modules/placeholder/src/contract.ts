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
};

export type PlaceholderContract = typeof placeholderContract;

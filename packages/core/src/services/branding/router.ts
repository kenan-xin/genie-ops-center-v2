import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { brandingContract } from "./contract.ts";

/** The Branding page router, empty until S3-07 adds its procedures. */
export function createBrandingRouter() {
  return implementCoreArea(brandingContract).router({});
}

export type BrandingRouter = ReturnType<typeof createBrandingRouter>;

import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { categoriesContract } from "./contract.ts";

/** The Categories page router, empty until S3-05 adds its procedures. */
export function createCategoriesRouter() {
  return implementCoreArea(categoriesContract).router({});
}

export type CategoriesRouter = ReturnType<typeof createCategoriesRouter>;

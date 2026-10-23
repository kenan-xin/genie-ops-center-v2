import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { modulesContract } from "./contract.ts";

/** The Modules page router, empty until S3-05 adds its procedures. */
export function createModulesRouter() {
  return implementCoreArea(modulesContract).router({});
}

export type ModulesRouter = ReturnType<typeof createModulesRouter>;

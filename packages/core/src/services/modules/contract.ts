import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { ModuleEnableResult } from "../module-management/index.ts";
import type { ModuleRow } from "./index.ts";

/** A module id is the text a declaration carries, not a uuid. */
const moduleId = z.string().min(1).max(200);

/**
 * The Modules page API (R-82 to R-86, R-91a), under core's `/modules/` area. Answers are typed from
 * the service with `z.custom`, as in the Roles contract.
 */
export const modulesContract = {
  list: oc
    .route({ method: "GET", path: "/modules" })
    .output(z.custom<readonly ModuleRow[]>()),

  setEnabled: oc
    .route({ method: "POST", path: "/modules/{moduleId}/enabled" })
    .input(z.object({ moduleId, enabled: z.boolean() }))
    .output(z.custom<ModuleEnableResult>()),

  setCategory: oc
    .route({ method: "PUT", path: "/modules/{moduleId}/category" })
    .input(z.object({ moduleId, categoryId: z.uuid().nullable() }))
    .output(z.custom<{ readonly changed: boolean }>()),
};

export type ModulesContract = typeof modulesContract;

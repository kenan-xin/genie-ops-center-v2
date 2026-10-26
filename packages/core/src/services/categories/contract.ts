import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { CategoryList } from "./index.ts";

// Trimmed before the bound, as the service counts; the service refuses a blank name.
const name = z.string().trim().max(80);

/**
 * The Categories page API (R-87 to R-91), under core's `/categories/` area. Every category id is a
 * uuid, so a malformed one is refused as input and never reaches Postgres.
 */
export const categoriesContract = {
  list: oc
    .route({ method: "GET", path: "/categories" })
    .output(z.custom<CategoryList>()),

  create: oc
    .route({ method: "POST", path: "/categories" })
    .input(z.object({ name }))
    .output(z.custom<{ readonly id: string }>()),

  rename: oc
    .route({ method: "PATCH", path: "/categories/{categoryId}" })
    .input(z.object({ categoryId: z.uuid(), name })),

  // The full ordered id list; the service refuses one that is not the current set (Decision 8).
  reorder: oc
    .route({ method: "PATCH", path: "/categories/order" })
    .input(z.object({ orderedIds: z.array(z.uuid()) })),

  remove: oc
    .route({ method: "DELETE", path: "/categories/{categoryId}" })
    .input(z.object({ categoryId: z.uuid() })),
};

export type CategoriesContract = typeof categoriesContract;

import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { CategoryList } from "./index.ts";

// The service trims and refuses a blank name; 80 is the service's own bound.
const name = z.string().max(80);

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
    .route({ method: "PUT", path: "/categories/order" })
    .input(z.object({ orderedIds: z.array(z.uuid()) })),

  remove: oc
    .route({ method: "DELETE", path: "/categories/{categoryId}" })
    .input(z.object({ categoryId: z.uuid() })),
};

export type CategoriesContract = typeof categoriesContract;

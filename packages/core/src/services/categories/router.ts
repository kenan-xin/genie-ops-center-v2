import type { Module } from "../../lib/module-contract/module.ts";
import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import { categoriesContract } from "./contract.ts";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  reorderCategories,
} from "./index.ts";

// The session check, then the permission gate, both before input is parsed, as in the Roles
// router: a caller without the key answers `forbidden` at 403 however malformed the input is.
const managed = gatedArea(categoriesContract, "core:settings:manage");

/** The Categories page router, behind `core:settings:manage` through the one `can()` seam (R-87). */
export function createCategoriesRouter(modules: readonly Module[]) {
  return managed.router({
    list: managed.list.handler(({ context }) =>
      listCategories(context.tenant, modules)
    ),

    create: managed.create.handler(async ({ context, input }) => ({
      id: await createCategory(context.tenant, {
        actorUserId: context.caller.userId,
        name: input.name,
      }),
    })),

    rename: managed.rename.handler(async ({ context, input }) => {
      await renameCategory(context.tenant, {
        actorUserId: context.caller.userId,
        categoryId: input.categoryId,
        name: input.name,
      });
    }),

    reorder: managed.reorder.handler(async ({ context, input }) => {
      await reorderCategories(context.tenant, {
        actorUserId: context.caller.userId,
        orderedIds: input.orderedIds,
      });
    }),

    remove: managed.remove.handler(async ({ context, input }) => {
      await deleteCategory(context.tenant, modules, {
        actorUserId: context.caller.userId,
        categoryId: input.categoryId,
      });
    }),
  });
}

export type CategoriesRouter = ReturnType<typeof createCategoriesRouter>;

import type { ReactElement } from "react";

import { AppError } from "../../lib/errors/index.ts";
import type { ModuleRPCContext } from "../../lib/rpc/implement-module.ts";
import { can } from "../authorization/index.ts";
import type { ModulePageMatch } from "./match.ts";

export type ModulePageAccess =
  | { readonly kind: "refused" }
  | { readonly kind: "missing" }
  | { readonly kind: "allowed" };

/** The check alone, with no loader: `can()`, then the record through `ctx.caller.recordOf`. */
export async function modulePageAccess(
  ctx: ModuleRPCContext,
  match: ModulePageMatch
): Promise<ModulePageAccess> {
  const { page, params } = match;

  if (page.record === undefined) {
    return (await can(ctx.caller, page.permission))
      ? { kind: "allowed" }
      : { kind: "refused" };
  }

  // On the record, never on the key alone: a key held on one record answers true for any (DEC-39).
  const ref = { type: page.record.type, id: params[page.record.param] ?? "" };

  if (!(await can(ctx.caller, page.permission, ref)))
    return { kind: "refused" };

  return (await ctx.caller.recordOf(ref)) === undefined
    ? { kind: "missing" }
    : { kind: "allowed" };
}

export type OpenedModulePage =
  | { readonly kind: "refused" }
  | { readonly kind: "missing" }
  | { readonly kind: "open"; readonly element: ReactElement };

/** The check, then `render`. A loader's `AppError` with code `not-found` answers missing. */
export async function openModulePage(
  ctx: ModuleRPCContext,
  match: ModulePageMatch
): Promise<OpenedModulePage> {
  const access = await modulePageAccess(ctx, match);

  if (access.kind !== "allowed") return access;

  try {
    return {
      kind: "open",
      element: await match.page.render(ctx, match.params),
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "not-found") {
      return { kind: "missing" };
    }

    throw error;
  }
}

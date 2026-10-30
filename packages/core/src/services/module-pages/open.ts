import type { ReactElement } from "react";

import type { PageBreadcrumb } from "../../features/shell/page-header.tsx";
import { AppError } from "../../lib/errors/index.ts";
import type { ModuleRPCContext } from "../../lib/rpc/implement-module.ts";
import { can } from "../authorization/index.ts";
import type { ModulePageMatch } from "./match.ts";

export type ModulePageAccess =
  | { readonly kind: "refused" }
  | { readonly kind: "missing" }
  | {
      readonly kind: "allowed";
      /** Only on a page that declares `parent` (R-1a). */
      readonly trail?: PageBreadcrumb;
      /** The record label, else the label of the page's own navigation entry. */
      readonly title?: string;
    };

/** What an allowed person reads of the page besides the page itself. */
type PageShown = { trail?: PageBreadcrumb; title?: string };

/** Built only after the check, so a refused person reads no trail and no title (Review Focus 1). */
function allowed(match: ModulePageMatch, label?: string): ModulePageAccess {
  const { module, surface, page } = match;

  const labelOf = (path: string) =>
    module.navigation.entries.find(
      (entry) => entry.surface === surface && entry.path === path
    )?.label;

  const parentLabel =
    page.parent === undefined ? undefined : labelOf(page.parent);

  const title = label ?? labelOf(page.path);

  const shown: PageShown = {};

  if (page.parent !== undefined && parentLabel !== undefined) {
    shown.trail = {
      parent: { label: parentLabel, href: page.parent },
      current: label,
    };
  }

  if (title !== undefined) shown.title = title;

  return { kind: "allowed", ...shown };
}

/** The check alone, with no loader: `can()`, then the record through `ctx.caller.recordOf`. */
export async function modulePageAccess(
  ctx: ModuleRPCContext,
  match: ModulePageMatch
): Promise<ModulePageAccess> {
  const { page, params } = match;

  if (page.record === undefined) {
    return (await can(ctx.caller, page.permission))
      ? allowed(match)
      : { kind: "refused" };
  }

  // On the record, never on the key alone: a key held on one record answers true for any (DEC-39).
  const ref = { type: page.record.type, id: params[page.record.param] ?? "" };

  if (!(await can(ctx.caller, page.permission, ref)))
    return { kind: "refused" };

  const found = await ctx.caller.recordOf(ref);

  return found === undefined
    ? { kind: "missing" }
    : allowed(match, found.label);
}

export type OpenedModulePage =
  | { readonly kind: "refused" }
  | { readonly kind: "missing" }
  | {
      readonly kind: "open";
      readonly element: ReactElement;
      readonly trail?: PageBreadcrumb;
      readonly title?: string;
    };

/**
 * The check, then `render`. A loader's `AppError` with code `not-found` answers missing, and one
 * with code `forbidden` answers refused, as the check's own refusal does.
 */
export async function openModulePage(
  ctx: ModuleRPCContext,
  match: ModulePageMatch
): Promise<OpenedModulePage> {
  const access = await modulePageAccess(ctx, match);

  if (access.kind !== "allowed") return access;

  const { kind: _allowed, ...shown } = access;

  try {
    return {
      ...shown,
      kind: "open",
      element: await match.page.render(ctx, match.params),
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "not-found") {
      return { kind: "missing" };
    }

    if (error instanceof AppError && error.code === "forbidden") {
      return { kind: "refused" };
    }

    throw error;
  }
}

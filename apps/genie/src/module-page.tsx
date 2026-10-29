import type { PermissionKey } from "@genie/core";
import { notFound } from "next/navigation.js";
import type { ComponentType, ReactNode } from "react";

import { requireSession } from "./document-session.ts";
import { pinnedRoutePermission } from "./module-route.ts";
import { renderIfPermitted } from "./page-access.tsx";
import { moduleById } from "./registry.ts";
import { keepBreakGlassInAdmin } from "./shell-frame.tsx";

export type ModuleRoute = {
  readonly moduleId: string;
  readonly surface: "workspace" | "admin";
  /** The route folder's own segments, for example ["m", "<id>"] or ["placeholder"]. */
  readonly base: readonly string[];
  /** The optional catch-all's segments after the base, decoded by Next. */
  readonly path: readonly string[];
};

/**
 * The page a module route answers with, and the permission pinned to the module's own key
 * (`pinnedRoutePermission`). A module that is not in this image has no registry entry, so an
 * excluded module answers nothing (R-22).
 */
function lookup(
  route: ModuleRoute
): { permission: PermissionKey; Page: ComponentType } | undefined {
  const module = moduleById.get(route.moduleId);

  if (module === undefined) return undefined;

  const permission = pinnedRoutePermission(
    module,
    route.surface,
    `/${[...route.base, ...route.path].join("/")}`
  );

  const Page =
    route.surface === "admin"
      ? module.pages.admin.settings
      : module.pages.workspace[route.path.at(-1) ?? "home"];

  return permission === undefined || Page === undefined
    ? undefined
    : { permission, Page };
}

/**
 * A module route's layout body: notFound() when no page answers, then requireSession(). It sits
 * above the route's loading.tsx, so the 404 and the sign-in redirect keep their status (`6wz1.76`).
 */
export async function ModuleRouteGate(
  props: ModuleRoute & { readonly children: ReactNode }
): Promise<ReactNode> {
  if (lookup(props) === undefined) notFound();

  await requireSession();

  if (props.surface === "workspace") await keepBreakGlassInAdmin();

  return props.children;
}

/** A module route's page body, behind the one authorization seam (DEC-39). */
export async function ModuleRoutePage(props: ModuleRoute): Promise<ReactNode> {
  const found = lookup(props);

  if (found === undefined) notFound();

  const { permission, Page } = found;

  return renderIfPermitted(permission, () => <Page />);
}

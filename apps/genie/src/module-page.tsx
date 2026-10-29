import {
  type ModulePageMatch,
  type ModuleRPCContext,
  matchModulePage,
  modulePageAccess,
  openModulePage,
} from "@genie/core";
import { PageTrailProvider } from "@genie/core/features/shell";
import type { Metadata } from "next";
import { headers } from "next/headers.js";
import { notFound } from "next/navigation.js";
import type { ReactNode } from "react";

import { requireContext } from "./context.ts";
import { documentPrincipal, requireSession } from "./document-session.ts";
import { NoAccessMain } from "./page-access.tsx";
import { moduleById } from "./registry.ts";
import { newRequestId } from "./request-id.ts";
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
 * The module page this route answers with, matched by core on the module's own declarations. A
 * module that is not in this image has no registry entry, so an excluded module answers nothing
 * (R-22).
 */
function lookup(route: ModuleRoute): ModulePageMatch | undefined {
  const module = moduleById.get(route.moduleId);

  return module === undefined
    ? undefined
    : matchModulePage(module, route.surface, [...route.base, ...route.path]);
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

/**
 * A module route's page body: core checks the page's permission through `can()` before its loader
 * runs, then renders it (Spec 7 R-1, DEC-39).
 */
export async function ModuleRoutePage(props: ModuleRoute): Promise<ReactNode> {
  const match = lookup(props);

  if (match === undefined) notFound();

  const opened = await openModulePage(await pageContext(), match);

  if (opened.kind === "refused") {
    return <NoAccessMain testId="permission-denied" />;
  }

  if (opened.kind === "missing") notFound();

  return (
    <PageTrailProvider value={opened.trail}>{opened.element}</PageTrailProvider>
  );
}

/**
 * A module route's document title, from the same check as the page: `generateMetadata` runs beside
 * the page, so a refused person gets the default title and never the record label (R-1a).
 */
export async function moduleRouteMetadata(
  route: ModuleRoute
): Promise<Metadata> {
  const match = lookup(route);

  // No page: the route's layout answers this request with 404.
  if (match === undefined) return {};

  const access = await modulePageAccess(await pageContext(), match);

  return access.kind === "allowed" && access.title !== undefined
    ? { title: access.title }
    : {};
}

async function pageContext(): Promise<ModuleRPCContext> {
  return {
    tenant: requireContext().tenant,
    caller: await documentPrincipal(),
    requestId: (await headers()).get("x-request-id") ?? newRequestId(),
  };
}

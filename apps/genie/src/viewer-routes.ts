// This file imports nothing, on purpose.
//
// An earlier draft read `moduleById` from the registry here. That is an
// indirect path to the database driver: the registry imports the compiled
// module declarations, a declaration imports its router, and the router imports
// the `@genie/core` root, which re-exports the tenant context and therefore
// `pg`. Because the proxy imports this file, that chain would have put the
// driver in the proxy bundle even though the proxy never imports core's root
// itself. The caller supplies the known ids instead.

/**
 * The server-owned viewer route mapping of R-49. It is an exact match, never a
 * path prefix, so a non-route path under `/viewer` keeps the deny baseline. No
 * incoming header selects a module.
 *
 * `viewerModuleIds` holds the ids that declared a frame-origin provider. An
 * empty set means no viewer route exists, which denies frames everywhere. That
 * is the safe answer before the bootstrap has published anything.
 */
export function viewerRouteFor(
  pathname: string,
  viewerModuleIds: ReadonlySet<string>
): { readonly moduleId: string } | undefined {
  const trimmed =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;

  const match = /^\/viewer\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(trimmed);

  // `noUncheckedIndexedAccess` types a capture group as string | undefined, so
  // this guard is required and is not defensive noise.
  const moduleId = match?.[1];

  if (moduleId === undefined) return undefined;

  if (!viewerModuleIds.has(moduleId)) return undefined;

  return { moduleId };
}

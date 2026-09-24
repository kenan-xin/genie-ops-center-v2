// This file imports nothing, on purpose.
//
// The proxy imports it, so it must not reach the registry: the registry imports the compiled
// module declarations, and a declaration imports its router, which imports the `@genie/core`
// root and therefore `pg`. The caller supplies the declared path-to-module map from the context
// slot instead.

/**
 * The module that owns one declared navigation path, or `undefined` for a path no compiled
 * module declared. It is an exact match after removing a trailing slash, never a path prefix, so
 * `/placeholder/anything` is not the placeholder's route unless the module declared it.
 *
 * The proxy uses this to refuse a disabled module's route before a page renders (R-8). A route
 * file that exists but was never declared in the module's navigation answers `undefined` and the
 * framework's own not-found applies, which is what keeps a disabled module's refusal
 * distinguishable from a route that does not exist at all.
 */
export function moduleRouteOwner(
  pathname: string,
  declared: ReadonlyMap<string, string>
): string | undefined {
  const trimmed =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;

  return declared.get(trimmed);
}

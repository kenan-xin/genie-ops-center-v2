import { type Module, type PermissionKey, permissionKeyFor } from "@genie/core";

/** The two route surfaces a module declares an entry for. */
export type ModuleRouteSurface = "workspace" | "admin";

/**
 * The permission each surface requires of its module's own key. The workspace
 * entry requires `<id>:use` (DEC-50) and the admin page `<id>:admin` (DEC-23).
 */
const SURFACE_ACTION = {
  workspace: "use",
  admin: "admin",
} as const;

/**
 * The permission a module route requires, derived from the module's canonical
 * id and from nothing the declaration says (DEC-50, DEC-23).
 *
 * A module's declaration is data: its `requiredPermission` field must not be
 * able to choose the key a route authorizes on. A declaration naming a key the
 * request holds — even one this deployment grants — would otherwise mount the
 * page without a grant this module issued. The registry validator rejects such
 * a declaration, but this function does not depend on that having run, so the
 * pinned routes stay safe if the validator is ever bypassed.
 *
 * The entry is still matched on surface and path, so a path the module never
 * declared answers `undefined` and the route reports not found.
 */
export function pinnedRoutePermission(
  module: Module,
  surface: ModuleRouteSurface,
  path: string
): PermissionKey | undefined {
  const declared = module.navigation.entries.some(
    (entry) => entry.surface === surface && entry.path === path
  );

  if (!declared) return undefined;

  return permissionKeyFor(module.identity.id, SURFACE_ACTION[surface]);
}

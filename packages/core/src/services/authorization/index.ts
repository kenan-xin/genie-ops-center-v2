import type {
  PermissionKey,
  ResourceRef,
  Scope,
  ScopeSet,
} from "../../lib/module-contract/keys.ts";
import type { RequestPrincipal } from "./principal.ts";

export type {
  GrantReader,
  PermissionGrants,
  PrincipalIdentity,
  RecordResolver,
  RequestPrincipal,
} from "./principal.ts";

export { createRequestPrincipal } from "./principal.ts";

export {
  createGrantReader,
  createRecordResolver,
  principalFor,
} from "./grant-reader.ts";

export {
  readOwnGroups,
  readRoleSummaries,
  type OwnGroup,
  type RoleSummaryRow,
} from "./role-summaries.ts";

export {
  AUDITOR_ROLE,
  CORE_PERMISSION_KEYS,
  GENIE_ADMINISTRATORS_GROUP,
  TENANT_ADMINISTRATOR_ROLE,
  permissionCatalogue,
  seedGenieAdministrators,
  seedRoles,
  syncModuleAdminKey,
} from "./roles.ts";

export {
  assertAdministratorRemains,
  assertNotSelf,
  countActiveAdministrators,
  lockAdministratorGuard,
} from "./administrators.ts";

export {
  assignRole,
  removeAssignment,
  removeGroupAssignments,
  type AssignmentPrincipal,
  type AssignmentWrite,
} from "./role-assignment.ts";

export { registerRoleEventHandlers } from "./role-events.ts";

export { PERMISSION_TRANSFORMATION_ACTION } from "./transformations.ts";

function sameScope(left: Scope, right: Scope): boolean {
  return left.type === right.type && left.id === right.id;
}

/**
 * The one permission check in the platform (DEC-39). Without `resource` it answers whether the
 * person holds the key anywhere. With one, a tenant-wide grant, a grant on the resource itself,
 * or a grant on one of the parents its module's resolver returns answers true (R-28). The
 * resolver runs only when no direct scope matched, and at most once per resource per request.
 *
 * A principal with no valid session is refused before anything is read: a request that is not
 * authenticated is never granted, whatever assignments exist, and no assignment query runs.
 */
export async function can(
  user: RequestPrincipal,
  permission: PermissionKey,
  resource?: ResourceRef
): Promise<boolean> {
  if (!user.authenticated) return false;

  const grants = await user.grants();

  if (grants.bypass === true) return true;

  if (!grants.keys.has(permission)) return false;

  if (resource === undefined) return true;

  const scopes = grants.scopes.get(permission) ?? { kind: "none" };

  if (scopes.kind === "all") return true;

  if (scopes.kind === "none") return false;

  if (scopes.scopes.some((scope) => sameScope(scope, resource))) return true;

  const parents = await user.parentsOf(resource);

  return parents.some((parent) =>
    scopes.scopes.some((scope) => sameScope(scope, parent))
  );
}

/**
 * The one scope filter for a list query (DEC-39). Parent scopes come back unchanged, for the
 * module to map onto its parent columns (R-29).
 *
 * Like `can()`, a principal with no valid session is refused with no scope and no read.
 */
export async function scopesFor(
  user: RequestPrincipal,
  permission: PermissionKey
): Promise<ScopeSet> {
  if (!user.authenticated) return { kind: "none" };

  const grants = await user.grants();

  if (grants.bypass === true) return { kind: "all" };

  if (!grants.keys.has(permission)) return { kind: "none" };

  return grants.scopes.get(permission) ?? { kind: "none" };
}

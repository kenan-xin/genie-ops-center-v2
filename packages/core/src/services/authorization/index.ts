import type {
  PermissionKey,
  ResourceRef,
  ScopeSet,
} from "../../lib/module-contract/keys.ts";
import type { RequestPrincipal } from "./principal.ts";

export type {
  GrantReader,
  PermissionGrants,
  PrincipalIdentity,
  RequestPrincipal,
} from "./principal.ts";

export { createRequestPrincipal } from "./principal.ts";

export { STUB_GRANTED_KEY, createStubGrantReader } from "./stub.ts";

/**
 * The one permission check in the platform (DEC-39). `resource` narrows the check to one record.
 * The Section 0 stub has no record-scoped grant, so a held key answers true for any resource.
 */
export async function can(
  user: RequestPrincipal,
  permission: PermissionKey,
  resource?: ResourceRef
): Promise<boolean> {
  const grants = await user.grants();

  if (!grants.keys.has(permission)) return false;

  if (resource === undefined) return true;

  const scopes = grants.scopes.get(permission) ?? { kind: "none" };

  if (scopes.kind === "all") return true;

  if (scopes.kind === "none") return false;

  return scopes.scopes.some(
    (scope) => scope.type === resource.type && scope.id === resource.id
  );
}

/** The one scope filter for a list query (DEC-39). */
export async function scopesFor(
  user: RequestPrincipal,
  permission: PermissionKey
): Promise<ScopeSet> {
  const grants = await user.grants();

  if (!grants.keys.has(permission)) return { kind: "none" };

  return grants.scopes.get(permission) ?? { kind: "none" };
}

/** A module permission key, always `<module-id>:<action>` (module contract, Permission keys). */
export type PermissionKey = `${string}:${string}`;

/** One record a permission can be checked against. */
export type ResourceRef = { readonly type: string; readonly id: string };

/** One scope a role assignment can point at. */
export type Scope = { readonly type: string; readonly id: string };

/** What `scopesFor()` answers: everything, nothing, or a named list (DEC-39). */
export type ScopeSet =
  | { readonly kind: "all" }
  | { readonly kind: "none" }
  | { readonly kind: "some"; readonly scopes: readonly Scope[] };

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * A module key has exactly two kebab-case parts. Core's own keys, such as
 * `core:settings:manage`, are not module keys and do not pass this check.
 */
export function isPermissionKey(value: string): value is PermissionKey {
  const parts = value.split(":");

  if (parts.length !== 2) return false;

  return parts.every((part) => KEBAB_CASE.test(part));
}

export function permissionKeyFor(moduleId: string, action: string): PermissionKey {
  if (!KEBAB_CASE.test(moduleId)) {
    throw new Error(`Module id "${moduleId}" is not kebab-case.`);
  }

  if (!KEBAB_CASE.test(action)) {
    throw new Error(`Action "${action}" is not kebab-case.`);
  }

  return `${moduleId}:${action}`;
}

import type {
  PermissionKey,
  ResourceRef,
  Scope,
  ScopeSet,
} from "../../lib/module-contract/keys.ts";

/** What one read of a person's assignments answers. */
export type PermissionGrants = {
  readonly keys: ReadonlySet<PermissionKey>;
  readonly scopes: ReadonlyMap<PermissionKey, ScopeSet>;
  /**
   * True only for the break-glass account once its session is no longer limited (R-30). It is
   * the one bypass, and it is never a wildcard key in a role.
   */
  readonly bypass?: boolean;
};

/** Reads the current person's assignments, once per request or job run (DEC-48). */
export type GrantReader = () => Promise<PermissionGrants>;

/**
 * The parents the owning module's record-type resolver returns for one resource (DEC-39,
 * module contract, Record types). An unknown type or record has no parents.
 */
export type ParentResolver = (
  resource: ResourceRef
) => Promise<readonly Scope[]>;

export type PrincipalIdentity = {
  readonly userId: string;
  /** Carried for display only; the loader reads memberships itself on each request (R-27). */
  readonly groups: readonly string[];
};

/**
 * The server-only wrapper `can()` and `scopesFor()` take. It is not the persisted user row, not a
 * value sent to a browser, and not the shared session. One is created per request and per job run,
 * and its lazy read is shared inside that one execution only (DEC-48, R-27).
 */
export type RequestPrincipal = PrincipalIdentity & {
  readonly grants: () => Promise<PermissionGrants>;
  /** The resource's declared parents, resolved at most once per resource per principal (R-28). */
  readonly parentsOf: ParentResolver;
};

const noParents: ParentResolver = () => Promise.resolve([]);

export function createRequestPrincipal(
  identity: PrincipalIdentity,
  read: GrantReader,
  resolveParents: ParentResolver = noParents
): RequestPrincipal {
  // The promise is memoised, not the resolved value, so two concurrent calls share one read.
  let pending: Promise<PermissionGrants> | undefined;
  const parents = new Map<string, Promise<readonly Scope[]>>();

  return {
    userId: identity.userId,
    groups: identity.groups,
    grants: () => {
      pending ??= read();

      return pending;
    },
    parentsOf: (resource) => {
      const key = `${resource.type}\u0000${resource.id}`;
      let resolved = parents.get(key);

      if (resolved === undefined) {
        resolved = resolveParents(resource);
        parents.set(key, resolved);
      }

      return resolved;
    },
  };
}

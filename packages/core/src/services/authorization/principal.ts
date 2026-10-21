import type {
  PermissionKey,
  ResourceRef,
  Scope,
  ScopeSet,
} from "../../lib/module-contract/keys.ts";
import type { RecordDescriptor } from "../../lib/module-contract/module.ts";

/** What one read of a person's assignments answers. */
export type PermissionGrants = {
  readonly keys: ReadonlySet<PermissionKey>;
  readonly scopes: ReadonlyMap<PermissionKey, ScopeSet>;
  /**
   * True only for the break-glass account once its session is no longer limited (R-30). It is
   * the one bypass, and it is never a wildcard key in a role.
   */
  readonly bypass?: boolean;
  /** Display metadata derived from the same R-27 assignment read as the grants. */
  readonly roleSummaries?: readonly RoleSummary[];
};

export type RoleSummary = {
  readonly roleName: string;
  readonly moduleName: string | null;
  readonly permissionCount: number;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
  readonly via: string | null;
};

/** Reads the current person's assignments, once per request or job run (DEC-48). */
export type GrantReader = () => Promise<PermissionGrants>;

/**
 * The record descriptor one resource's owning module returns (DEC-39, module contract, Record
 * types): its label, optional authorized path, the path's permission, and its declared parents.
 * An unknown type or record answers `undefined`. One call resolves one resource.
 */
export type RecordResolver = (
  resource: ResourceRef
) => Promise<RecordDescriptor | undefined>;

export type PrincipalIdentity = {
  readonly userId: string;
  /** Carried for display only; the loader reads memberships itself on each request (R-27). */
  readonly groups: readonly string[];
  /**
   * Whether this request carries a valid session (Spec 2 R-14). It is set from the enforced
   * session read and from nothing else - never from `userId`, which is the person's own row id and
   * may be any text (a real row whose id happens to be `anonymous` is still signed in). `can()`
   * and `scopesFor()` refuse a principal whose value is false before reading one assignment.
   */
  readonly authenticated: boolean;
};

/**
 * The server-only wrapper `can()` and `scopesFor()` take. It is not the persisted user row, not a
 * value sent to a browser, and not the shared session. One is created per request and per job run,
 * and its lazy read is shared inside that one execution only (DEC-48, R-27).
 */
export type RequestPrincipal = PrincipalIdentity & {
  /**
   * Whether the request carries a valid session (Spec 2 R-14). A protected procedure reads this
   * before it parses input or calls `can()`, so an anonymous, idle-expired or capped request is
   * answered `unauthenticated` rather than a permission, input or resource error.
   */
  readonly authenticated: boolean;
  readonly grants: () => Promise<PermissionGrants>;
  /**
   * The resource's descriptor, resolved at most once per resource per principal (R-28). A reader
   * that needs the label and path (the audit reader) and the authorization check that needs the
   * parents read this one memo, so the owning module's resolver runs once for one target.
   */
  readonly recordOf: RecordResolver;
  /** The resource's declared parents, from the same resolution `recordOf` shares (R-28). */
  readonly parentsOf: (resource: ResourceRef) => Promise<readonly Scope[]>;
};

const noRecord: RecordResolver = () => Promise.resolve(undefined);

export function createRequestPrincipal(
  identity: PrincipalIdentity,
  read: GrantReader,
  resolveRecord: RecordResolver = noRecord
): RequestPrincipal {
  // The promise is memoised, not the resolved value, so two concurrent calls share one read.
  let pending: Promise<PermissionGrants> | undefined;
  const records = new Map<string, Promise<RecordDescriptor | undefined>>();

  const recordOf: RecordResolver = (resource) => {
    const key = `${resource.type}\u0000${resource.id}`;
    let resolved = records.get(key);

    if (resolved === undefined) {
      resolved = resolveRecord(resource);
      records.set(key, resolved);
    }

    return resolved;
  };

  return {
    authenticated: identity.authenticated,
    userId: identity.userId,
    groups: identity.groups,
    grants: () => {
      pending ??= read();

      return pending;
    },
    recordOf,
    parentsOf: async (resource) => {
      const descriptor = await recordOf(resource);

      return descriptor?.parents ?? [];
    },
  };
}

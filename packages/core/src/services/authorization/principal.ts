import type {
  PermissionKey,
  ScopeSet,
} from "../../lib/module-contract/keys.ts";

/** What one read of a person's assignments answers. */
export type PermissionGrants = {
  readonly keys: ReadonlySet<PermissionKey>;
  readonly scopes: ReadonlyMap<PermissionKey, ScopeSet>;
};

/** Reads the current person's assignments. Section 2 replaces the stub behind this type. */
export type GrantReader = () => Promise<PermissionGrants>;

export type PrincipalIdentity = {
  readonly userId: string;
  readonly groups: readonly string[];
};

/**
 * The server-only wrapper `can()` and `scopesFor()` take. It is not the persisted user row, not a
 * value sent to a browser, and not the shared session. One is created per request and per job run,
 * and its lazy read is shared inside that one execution only (DEC-48, R-14).
 */
export type RequestPrincipal = PrincipalIdentity & {
  readonly grants: () => Promise<PermissionGrants>;
};

export function createRequestPrincipal(
  identity: PrincipalIdentity,
  read: GrantReader
): RequestPrincipal {
  // The promise is memoised, not the resolved value, so two concurrent calls share one read.
  let pending: Promise<PermissionGrants> | undefined;

  return {
    userId: identity.userId,
    groups: identity.groups,
    grants: () => {
      pending ??= read();

      return pending;
    },
  };
}

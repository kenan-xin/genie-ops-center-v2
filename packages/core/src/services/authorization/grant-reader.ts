import type {
  PermissionKey,
  Scope,
  ScopeSet,
} from "../../lib/module-contract/keys.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  type GrantReader,
  type ParentResolver,
  type PermissionGrants,
  type RequestPrincipal,
  createRequestPrincipal,
} from "./principal.ts";
import { permissionCatalogue } from "./roles.ts";

const NO_GRANTS: PermissionGrants = { keys: new Set(), scopes: new Map() };

const BYPASS: PermissionGrants = { ...NO_GRANTS, bypass: true };

/**
 * The one assignment query of R-27: the person's own row for the break-glass rule, then every
 * assignment whose principal is the person or a group they belong to, with the role's keys and
 * the scope. A group that is archived contributes nothing, and its rows are kept (R-32). A person
 * without assignments still returns their own row, once, with null role columns.
 */
const ASSIGNMENTS_SQL = `
  select u.is_break_glass, u.must_change_password, u.two_factor_enabled,
         r.permissions, a.scope_type, a.scope_id
    from "user" u
    left join role_assignment a
      on (a.principal_type = 'user' and a.principal_id = u.id)
      or (a.principal_type = 'group' and a.principal_id in (
            select m.group_id::text
              from group_member m
              join "group" g on g.id = m.group_id
             where m.user_id = u.id and g.archived_at is null))
    left join role r on r.id = a.role_id
   where u.id = $1`;

/** The one statement the loader sends; the context pool's `query` is one, bound. */
export type AssignmentQuery = (
  text: string,
  values: readonly string[]
) => Promise<{ readonly rows: readonly AssignmentRow[] }>;

type AssignmentRow = {
  readonly is_break_glass: boolean;
  readonly must_change_password: boolean | null;
  readonly two_factor_enabled: boolean | null;
  readonly permissions: readonly string[] | null;
  readonly scope_type: string | null;
  readonly scope_id: string | null;
};

/**
 * Folds the rows into grants. A key the catalogue does not know, retired or unknown, never
 * grants, while the other keys of the same role still do (R-33b). A null scope is the whole
 * tenant and wins over any list (R-29).
 */
function grantsFrom(
  rows: readonly AssignmentRow[],
  catalogue: ReadonlySet<string>
): PermissionGrants {
  const person = rows[0];

  if (person === undefined) return NO_GRANTS;

  // R-30: the break-glass account bypasses only once its session is no longer limited, and a
  // limited one is refused everything, whatever it holds.
  if (person.is_break_glass) {
    const limited =
      person.must_change_password === true ||
      person.two_factor_enabled !== true;

    return limited ? NO_GRANTS : BYPASS;
  }

  const tenantWide = new Set<PermissionKey>();
  const listed = new Map<PermissionKey, Scope[]>();

  for (const row of rows) {
    for (const key of row.permissions ?? []) {
      if (!catalogue.has(key)) continue;

      // SAFETY: the catalogue holds only declared keys, each a `<prefix>:<action>` string.
      const permission = key as PermissionKey;

      if (row.scope_type === null || row.scope_id === null) {
        tenantWide.add(permission);
      } else {
        const scopes = listed.get(permission) ?? [];

        scopes.push({ type: row.scope_type, id: row.scope_id });
        listed.set(permission, scopes);
      }
    }
  }

  const scopes = new Map<PermissionKey, ScopeSet>();

  for (const [permission, list] of listed) {
    scopes.set(permission, { kind: "some", scopes: list });
  }

  for (const permission of tenantWide) {
    scopes.set(permission, { kind: "all" });
  }

  return { keys: new Set(scopes.keys()), scopes };
}

/**
 * The real grant reader behind the Section 0 signature (DEC-48). A caller without a user id, an
 * anonymous request, is refused everything without a query.
 */
export function createGrantReader(
  query: AssignmentQuery,
  userId: string | undefined,
  catalogue: ReadonlySet<string>
): GrantReader {
  return async () => {
    if (userId === undefined) return NO_GRANTS;

    const result = await query(ASSIGNMENTS_SQL, [userId]);

    return grantsFrom(result.rows, catalogue);
  };
}

/**
 * The parents of one resource, from the record type a compiled module declares under that type.
 * A type no module declares, or a record its resolver does not find, has no parents.
 */
export function createParentResolver(
  modules: readonly Pick<Module, "recordTypes">[]
): ParentResolver {
  return async (resource) => {
    const recordType = modules
      .flatMap((module) => module.recordTypes)
      .find((candidate) => candidate.type === resource.type);

    const descriptor = await recordType?.resolve(resource.id);

    return descriptor?.parents ?? [];
  };
}

/**
 * The one lazy loader for a request or a job run (R-27): the tRPC context, the page loader and
 * the worker each call this once per execution and never share the result. `userId` is the
 * signed-in person, or undefined for an anonymous request.
 */
export function principalFor(input: {
  readonly tenant: Pick<TenantContext, "db">;
  readonly modules: readonly Pick<Module, "permissions" | "recordTypes">[];
  readonly userId: string | undefined;
}): RequestPrincipal {
  return createRequestPrincipal(
    { userId: input.userId ?? "anonymous", groups: [] },
    createGrantReader(
      (text, values) => input.tenant.db.$client.query(text, [...values]),
      input.userId,
      permissionCatalogue(input.modules)
    ),
    createParentResolver(input.modules)
  );
}

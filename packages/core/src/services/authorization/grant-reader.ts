import type {
  PermissionKey,
  Scope,
  ScopeSet,
} from "../../lib/module-contract/keys.ts";
import type {
  Module,
  RecordDescriptor,
} from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  type GrantReader,
  type PermissionGrants,
  type RoleSummary,
  type RecordResolver,
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
 * without assignments still returns their own row, once, with null role columns. `inactive` is a
 * ban that has not expired, or an erased account; either one grants nothing.
 */
const ASSIGNMENTS_SQL = `
  select u.is_break_glass, u.must_change_password, u.two_factor_enabled,
         (u.erased_at is not null
           or (u.banned is true and (u.ban_expires is null or u.ban_expires > now())))
           as inactive,
         r.permissions, a.scope_type, a.scope_id,
         r.name as role_name, r.module_id as module_name,
         cardinality(r.permissions) as permission_count,
         case when a.principal_type = 'group' then g.name end as via
    from "user" u
    left join role_assignment a
      on (a.principal_type = 'user' and a.principal_id = u.id)
      or (a.principal_type = 'group' and a.principal_id in (
            select m.group_id::text
              from group_member m
              join "group" g on g.id = m.group_id
             where m.user_id = u.id and g.archived_at is null))
    left join role r on r.id = a.role_id
    left join "group" g on a.principal_type = 'group' and g.id = a.principal_id::uuid
   where u.id = $1`;

/** The one statement the loader sends; the context pool's `query` is one, bound. */
export type AssignmentQuery = (
  text: string,
  values: readonly string[]
) => Promise<{ readonly rows: readonly AssignmentRow[] }>;

type AssignmentRow = {
  readonly is_break_glass: boolean;
  readonly inactive: boolean;
  readonly must_change_password: boolean | null;
  readonly two_factor_enabled: boolean | null;
  readonly permissions: readonly string[] | null;
  readonly scope_type: string | null;
  readonly scope_id: string | null;
  readonly role_name: string | null;
  readonly module_name: string | null;
  readonly permission_count: number | null;
  readonly via: string | null;
};

/**
 * Folds the rows into grants. A key the catalogue does not know, retired or unknown, never
 * grants, while the other keys of the same role still do (R-33b). A scope whose type and id are
 * both null is the whole tenant and wins over any list (R-29); a row with only one of the two is
 * malformed and grants nothing, so the loader fails closed.
 */
function grantsFrom(
  rows: readonly AssignmentRow[],
  catalogue: ReadonlySet<string>
): PermissionGrants {
  const person = rows[0];

  if (person === undefined || person.inactive) return NO_GRANTS;

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

      if (row.scope_type === null && row.scope_id === null) {
        tenantWide.add(permission);
      } else if (row.scope_type !== null && row.scope_id !== null) {
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

  const roleSummaries: RoleSummary[] = [];

  for (const row of rows) {
    if (
      row.role_name === null ||
      (row.scope_type === null) !== (row.scope_id === null)
    )
      continue;
    roleSummaries.push({
      roleName: row.role_name,
      moduleName: row.module_name,
      permissionCount: row.permission_count ?? 0,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      via: row.via,
    });
  }

  return { keys: new Set(scopes.keys()), scopes, roleSummaries };
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
 * The descriptor of one resource, from the record type a compiled module declares under that type,
 * resolved through the request's own tenant context (DEC-34). A type no module declares, or a
 * record its resolver does not find, answers `undefined` (no label, no path, no parents), and a
 * parent of a type the record type does not declare is dropped (module contract, Record types).
 *
 * The `parents` and the label and path come from one resolution, and `can()` reads the same
 * descriptor through the principal's memo, so one target's resolver runs once per request.
 */
export function createRecordResolver(
  modules: readonly Pick<Module, "recordTypes">[],
  tenant: TenantContext
): RecordResolver {
  return async (resource) => {
    const recordType = modules
      .flatMap((module) => module.recordTypes)
      .find((candidate) => candidate.type === resource.type);

    if (recordType === undefined) return undefined;

    const descriptor = await recordType.resolve({ tenant }, resource.id);

    if (descriptor === undefined) return undefined;

    const declared = new Set(recordType.parentTypes ?? []);
    const parents = descriptor.parents ?? [];

    if (parents.every((parent) => declared.has(parent.type))) return descriptor;

    return {
      ...descriptor,
      parents: parents.filter((parent) => declared.has(parent.type)),
    } satisfies RecordDescriptor;
  };
}

/**
 * The one lazy loader for a request (R-27): the tRPC context and the page loader call this once
 * per request and never share the result. `userId` is the signed-in person's row id, and
 * `authenticated` says whether this request's enforced session read (R-14) found a valid session.
 * They are supplied separately on purpose: `userId` is unrestricted text, so no value of it - and
 * no sentinel - can stand for "no session". The worker does not build one per job run yet; a job
 * that acts for a person calls this once per run when that wiring lands.
 */
export function principalFor(input: {
  readonly tenant: TenantContext;
  readonly modules: readonly Pick<Module, "permissions" | "recordTypes">[];
  readonly userId: string | undefined;
  readonly authenticated: boolean;
}): RequestPrincipal {
  return createRequestPrincipal(
    {
      userId: input.userId ?? "",
      groups: [],
      authenticated: input.authenticated,
    },
    createGrantReader(
      (text, values) => input.tenant.db.$client.query(text, [...values]),
      input.userId,
      permissionCatalogue(input.modules)
    ),
    createRecordResolver(input.modules, input.tenant)
  );
}

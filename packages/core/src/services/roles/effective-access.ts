import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Scope } from "../../lib/module-contract/keys.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { likePattern } from "../../utils/like-pattern.ts";
import { eligibility } from "../authorization/eligibility.ts";
import { scopesFor } from "../authorization/index.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { groupLabelSql } from "../groups/label.ts";
import { groupMemberCountSql } from "../groups/member-count.ts";
import { entitlementByModule, type RolesModule } from "./index.ts";

/** Why a path that stays grants nothing now (R-32, D2-6). The order is the order of the list. */
export type NotInEffect = "group-archived" | "person-disabled" | "module-off";

export type AccessHolder =
  | { readonly type: "user"; readonly id: string; readonly name: string }
  | {
      readonly type: "group";
      readonly id: string;
      readonly name: string;
      /** `group.source`: "idp" for a directory group, "local" for one made here (G14). */
      readonly source: "idp" | "local";
    };

/** One `role_assignment` row through which a recipient holds a role (A8, R-37d). */
export type AccessPath = {
  readonly assignmentId: string;
  /** The recipient itself (a direct path) or, for a person, one of their groups. */
  readonly holder: AccessHolder;
  readonly role: {
    readonly id: string;
    readonly name: string;
    readonly kind: "system" | "custom";
    /** `role.module_id`: null for a core role. */
    readonly moduleId: string | null;
    readonly permissions: readonly string[];
  };
  /** Type and id only: a record label travels under the check of its own record. */
  readonly scope: Scope | null;
  /** Null for a row that setup seeded, and for the break-glass account (R-39). */
  readonly addedBy: { readonly id: string; readonly name: string } | null;
  /**
   * True for a row that setup wrote (`created_by_user_id` is null): "at setup" (G2 change 4). A
   * write by the break-glass account is false, with `addedBy` null (R-39).
   */
  readonly addedAtSetup: boolean;
  /** `created_at` in UTC with microseconds, for example `2026-11-03T10:00:00.123456Z`. */
  readonly addedAt: string;
  /** In the order of `NotInEffect`. Empty when the path grants now. */
  readonly notInEffect: readonly NotInEffect[];
};

export type AccessRecipient = {
  readonly type: "user" | "group";
  readonly id: string;
};

/** What Overview pages by: a person, a group, a module (D8), or a role (`d8l5.46`). */
export type AccessSubject =
  | AccessRecipient
  | { readonly type: "module"; readonly id: string }
  | { readonly type: "role"; readonly id: string };

/** The filters of the Overview list (d8l5.62). Each is optional, and they combine with AND. */
export type AssignmentFilters = {
  /** A person: their own rows and the rows of each group they belong to. A group: its own rows. */
  readonly recipient?: AccessRecipient | undefined;
  /** Every role that opens the module (`<id>:use`), as D8 reads it, whatever its `module_id`. */
  readonly moduleId?: string | undefined;
  readonly roleId?: string | undefined;
};

export type AccessCursor = {
  readonly addedAt: string;
  readonly assignmentId: string;
};

export type AccessPage = {
  readonly paths: readonly AccessPath[];
  /** Every path that the filters and the query keep. Only the first page (cursor null) counts it. */
  readonly total: number | null;
  readonly nextCursor: AccessCursor | null;
  /**
   * The member count of each group that holds an assignment on this page, by group id, without the
   * break-glass account. Only this read carries it: it sits behind core:roles:manage, and the person
   * read of a people manager names no group size (R-37e).
   */
  readonly memberCounts: Readonly<Record<string, number>>;
};

/** The Overview page size when the caller asks for none. */
export const ACCESS_PAGE_SIZE = 10;

/** The Overview page size (access-start b: "1–25 of 1,284"). */
export const OVERVIEW_PAGE_SIZE = 25;

type RawPath = {
  readonly assignmentId: string;
  readonly holderType: "user" | "group";
  readonly holderId: string;
  readonly holderName: string;
  readonly holderSource: string | null;
  readonly roleId: string;
  readonly roleName: string;
  readonly isSystem: boolean;
  readonly moduleId: string | null;
  readonly permissions: readonly string[];
  readonly scopeType: string | null;
  readonly scopeId: string | null;
  readonly addedById: string | null;
  readonly addedByName: string | null;
  readonly addedAtSetup: boolean;
  readonly addedAt: string;
  readonly groupArchived: boolean;
  readonly holderDisabled: boolean;
};

const holder = eligibility("hu", "hg");

const recipient = eligibility("u", "g");

/**
 * The columns and joins of every path read. A holder whose row is gone, an erased person and the
 * break-glass account hold nothing here (R-39). `inactivePerson` and `activeGroup` are the grant
 * reader's rules, so a path flagged here is a path that `can()` does not grant through.
 */
const PATHS_SQL = `
  select a.id::text as "assignmentId", a.principal_type as "holderType",
         a.principal_id as "holderId",
         coalesce(hu.name, ${groupLabelSql("hg")}) as "holderName",
         hg.source as "holderSource",
         r.id::text as "roleId", r.name as "roleName", r.is_system as "isSystem",
         r.module_id as "moduleId", r.permissions,
         a.scope_type as "scopeType", a.scope_id as "scopeId",
         case when cb.is_break_glass then null else cb.id end as "addedById",
         case when cb.is_break_glass then null else cb.name end as "addedByName",
         (a.created_by_user_id is null) as "addedAtSetup",
         to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "addedAt",
         (hg.id is not null and not ${holder.activeGroup}) as "groupArchived",
         (hu.id is not null and ${holder.inactivePerson}) as "holderDisabled"
    from role_assignment a
    join role r on r.id = a.role_id
    left join "user" hu on a.principal_type = 'user' and hu.id = a.principal_id
    left join "group" hg on a.principal_type = 'group' and hg.id::text = a.principal_id
    left join "user" cb on cb.id = a.created_by_user_id
   where (hg.id is not null
          or (hu.id is not null and hu.erased_at is null and hu.is_break_glass = false))`;

/** The filter of each subject type, on the placeholder `p` of its id (`$1`, `$4`, ...). */
const SUBJECT_FILTER = {
  user: (p: string) => `((a.principal_type = 'user' and a.principal_id = ${p})
          or (a.principal_type = 'group' and a.principal_id in (
                select m.group_id::text from group_member m where m.user_id = ${p})))`,
  group: (p: string) =>
    `(a.principal_type = 'group' and a.principal_id = ${p})`,
  // D8: every role that opens the module, whatever its `module_id`, as `readHolders` reads it.
  module: (p: string) => `((${p} || ':use') = any(r.permissions))`,
  // A text compare, so a malformed id from a typed link matches nothing and never casts.
  role: (p: string) => `(r.id::text = ${p})`,
} as const;

const ORDER_SQL = `order by a.created_at desc, a.id desc`;

/**
 * `gatedArea` admits a holder of the key at any scope, because `can()` without a resource answers
 * "holds it anywhere". The read shows every recipient, so it needs the key tenant-wide (D7).
 */
export async function managesAllRoles(
  caller: RequestPrincipal
): Promise<boolean> {
  return (await scopesFor(caller, "core:roles:manage")).kind === "all";
}

/** `forbidden` unless `managesAllRoles`. */
export async function assertManagesAllRoles(
  caller: RequestPrincipal
): Promise<void> {
  if (!(await managesAllRoles(caller))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }
}

/**
 * Whether the recipient is a disabled person: `not-found` for a person who is erased, the
 * break-glass account or no row, and for a group with no row. An archived group is read.
 */
export async function recipientDisabled(
  tenant: TenantContext,
  target: AccessRecipient
): Promise<boolean> {
  const result =
    target.type === "user"
      ? await tenant.db.$client.query<{ readonly disabled: boolean }>(
          `select ${recipient.inactivePerson} as disabled from "user" u
            where u.id = $1 and u.is_break_glass = false and u.erased_at is null`,
          [target.id]
        )
      : await tenant.db.$client.query<{ readonly disabled: boolean }>(
          `select false as disabled from "group" g where g.id::text = $1`,
          [target.id]
        );

  const [row] = result.rows;

  if (row === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  return row.disabled;
}

function toPath(
  raw: RawPath,
  flags: { readonly personDisabled: boolean; readonly moduleOff: boolean }
): AccessPath {
  const notInEffect: NotInEffect[] = [];

  if (raw.groupArchived) notInEffect.push("group-archived");

  if (raw.holderDisabled || flags.personDisabled) {
    notInEffect.push("person-disabled");
  }

  if (flags.moduleOff) notInEffect.push("module-off");

  return {
    assignmentId: raw.assignmentId,
    holder:
      raw.holderType === "group"
        ? {
            type: "group",
            id: raw.holderId,
            name: raw.holderName,
            source: raw.holderSource === "idp" ? "idp" : "local",
          }
        : { type: "user", id: raw.holderId, name: raw.holderName },
    role: {
      id: raw.roleId,
      name: raw.roleName,
      kind: raw.isSystem ? "system" : "custom",
      moduleId: raw.moduleId,
      permissions: raw.permissions,
    },
    scope:
      raw.scopeType !== null && raw.scopeId !== null
        ? { type: raw.scopeType, id: raw.scopeId }
        : null,
    addedBy:
      raw.addedById !== null && raw.addedByName !== null
        ? { id: raw.addedById, name: raw.addedByName }
        : null,
    addedAtSetup: raw.addedAtSetup,
    addedAt: raw.addedAt,
    notInEffect,
  };
}

/**
 * Every path through which one person or group holds a role, newest first, for Grants (A8,
 * R-37d): a person's direct rows and the rows of each group they belong to, or a group's own rows.
 * A path that grants nothing now stays, and names why. The read decides nothing: `can()` and
 * `scopesFor()` stay the only checks (DEC-39).
 */
export async function readRecipientAccess(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly recipient: AccessRecipient;
}): Promise<readonly AccessPath[]> {
  await assertManagesAllRoles(input.caller);

  return recipientPaths(input.tenant, input.modules, input.recipient);
}

/** The paths of one recipient, as `readRecipientAccess` says. The caller checked the key (DEC-39). */
export async function recipientPaths(
  tenant: TenantContext,
  modules: readonly RolesModule[],
  target: AccessRecipient
): Promise<readonly AccessPath[]> {
  const personDisabled = await recipientDisabled(tenant, target);

  const entitled = await entitlementByModule(tenant, modules);

  const result = await tenant.db.$client.query<RawPath>(
    `${PATHS_SQL} and ${SUBJECT_FILTER[target.type]("$1")} ${ORDER_SQL}`,
    [target.id]
  );

  return result.rows.map((raw) =>
    toPath(raw, {
      personDisabled,
      moduleOff: raw.moduleId !== null && entitled.get(raw.moduleId) !== true,
    })
  );
}

/**
 * The paths of one person, group, module or role for Overview (A8, R-37b): `readAssignments` with
 * the one filter that the subject names. Role detail, the person and group reads and the module
 * sheet call it.
 */
export async function readAccessBySubject(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly subject: AccessSubject;
  readonly query: string;
  readonly cursor: AccessCursor | null;
  readonly limit: number;
}): Promise<AccessPage> {
  const { subject, ...rest } = input;

  return readAssignments({
    ...rest,
    filters:
      subject.type === "module"
        ? { moduleId: subject.id }
        : subject.type === "role"
          ? { roleId: subject.id }
          : { recipient: subject },
  });
}

/**
 * Every assignment that the filters keep, newest first and keyset paged on `(created_at, id)` (D13,
 * d8l5.62). The cursor keeps the microseconds that SQL wrote, so rows of one transaction page
 * without a skip. The search covers the holder, the role and the module display name before the
 * page is cut, and only the first page counts the matches.
 */
export async function readAssignments(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly filters: AssignmentFilters;
  readonly query: string;
  readonly cursor: AccessCursor | null;
  readonly limit: number;
}): Promise<AccessPage> {
  await assertManagesAllRoles(input.caller);

  const { recipient: target, moduleId, roleId } = input.filters;

  // `not-found` for an erased person, the break-glass account or no row.
  const personDisabled =
    target === undefined
      ? false
      : await recipientDisabled(input.tenant, target);

  const entitled = await entitlementByModule(input.tenant, input.modules);

  const values: (string | number | readonly string[])[] = [];

  const param = (value: string | number | readonly string[]) => {
    values.push(value);

    return `$${values.length}`;
  };

  let filters = "";

  if (target !== undefined) {
    filters += ` and ${SUBJECT_FILTER[target.type](param(target.id))}`;
  }

  if (moduleId !== undefined) {
    filters += ` and ${SUBJECT_FILTER.module(param(moduleId))}`;
  }

  if (roleId !== undefined) {
    filters += ` and ${SUBJECT_FILTER.role(param(roleId))}`;
  }

  const term = input.query.trim();

  if (term !== "") {
    const lower = term.toLowerCase();
    const like = param(likePattern(term));

    const ids = param(
      input.modules
        .filter((module) =>
          module.identity.displayName.toLowerCase().includes(lower)
        )
        .map((module) => module.identity.id)
    );

    filters += ` and (coalesce(hu.name, ${groupLabelSql("hg")}) ilike ${like} escape '\\'
                  or r.name ilike ${like} escape '\\' or r.module_id = any(${ids}::text[]))`;
  }

  const total =
    input.cursor === null
      ? ((
          await input.tenant.db.$client.query<{ readonly total: number }>(
            `select count(*)::int as total from (${PATHS_SQL}${filters}) paths`,
            values
          )
        ).rows[0]?.total ?? 0)
      : null;

  const cursorSql =
    input.cursor === null
      ? ""
      : ` and (a.created_at, a.id) < (${param(input.cursor.addedAt)}::timestamptz, ${param(input.cursor.assignmentId)}::uuid)`;

  const result = await input.tenant.db.$client.query<RawPath>(
    `${PATHS_SQL}${filters}${cursorSql} ${ORDER_SQL} limit ${param(input.limit + 1)}`,
    values
  );

  const rows = result.rows.slice(0, input.limit);

  const groupIds = [
    ...new Set(
      rows.flatMap((raw) => (raw.holderType === "group" ? [raw.holderId] : []))
    ),
  ];

  const memberCounts: Record<string, number> =
    groupIds.length === 0
      ? {}
      : Object.fromEntries(
          (
            await input.tenant.db.$client.query<{
              readonly id: string;
              readonly memberCount: number;
            }>(
              `select g.id::text as id, ${groupMemberCountSql("g")} as "memberCount"
                 from "group" g where g.id::text = any($1::text[])`,
              [groupIds]
            )
          ).rows.map((row) => [row.id, row.memberCount])
        );

  const last = rows.at(-1);

  // Ask is core, so the map never holds it: only a registered module can be off.
  const filteredModuleOff =
    moduleId !== undefined && entitled.get(moduleId) === false;

  return {
    paths: rows.map((raw) =>
      toPath(raw, {
        personDisabled,
        moduleOff:
          moduleId !== undefined
            ? filteredModuleOff
            : raw.moduleId !== null && entitled.get(raw.moduleId) !== true,
      })
    ),
    total,
    nextCursor:
      result.rows.length > input.limit && last !== undefined
        ? { addedAt: last.addedAt, assignmentId: last.assignmentId }
        : null,
    memberCounts,
  };
}

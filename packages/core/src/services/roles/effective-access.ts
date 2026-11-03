import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Scope } from "../../lib/module-contract/keys.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { eligibility } from "../authorization/eligibility.ts";
import { scopesFor } from "../authorization/index.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { groupLabelSql } from "../groups/label.ts";
import { entitlementByModule, type RolesModule } from "./index.ts";

/** Why a path that stays grants nothing now (R-32, D2-6). The order is the order of the list. */
export type NotInEffect = "group-archived" | "person-disabled" | "module-off";

/** One `role_assignment` row through which a recipient holds a role (A8, R-37d). */
export type AccessPath = {
  readonly assignmentId: string;
  /** The recipient itself (a direct path) or, for a person, one of their groups. */
  readonly holder: {
    readonly type: "user" | "group";
    readonly id: string;
    readonly name: string;
  };
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
  /** `created_at` in UTC with microseconds, for example `2026-11-03T10:00:00.123456Z`. */
  readonly addedAt: string;
  /** In the order of `NotInEffect`. Empty when the path grants now. */
  readonly notInEffect: readonly NotInEffect[];
};

export type AccessRecipient = {
  readonly type: "user" | "group";
  readonly id: string;
};

type RawPath = {
  readonly assignmentId: string;
  readonly holderType: "user" | "group";
  readonly holderId: string;
  readonly holderName: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly isSystem: boolean;
  readonly moduleId: string | null;
  readonly permissions: readonly string[];
  readonly scopeType: string | null;
  readonly scopeId: string | null;
  readonly addedById: string | null;
  readonly addedByName: string | null;
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
         r.id::text as "roleId", r.name as "roleName", r.is_system as "isSystem",
         r.module_id as "moduleId", r.permissions,
         a.scope_type as "scopeType", a.scope_id as "scopeId",
         case when cb.is_break_glass then null else cb.id end as "addedById",
         case when cb.is_break_glass then null else cb.name end as "addedByName",
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

/** The fixed filter of each recipient type. `$1` is the recipient id. */
const RECIPIENT_FILTER = {
  user: `((a.principal_type = 'user' and a.principal_id = $1)
          or (a.principal_type = 'group' and a.principal_id in (
                select m.group_id::text from group_member m where m.user_id = $1)))`,
  group: `(a.principal_type = 'group' and a.principal_id = $1)`,
} as const;

const ORDER_SQL = `order by a.created_at desc, a.id desc`;

/**
 * `gatedArea` admits a holder of the key at any scope, because `can()` without a resource answers
 * "holds it anywhere". The read shows every recipient, so it needs the key tenant-wide (D7).
 */
async function assertManagesAllRoles(caller: RequestPrincipal): Promise<void> {
  const scopes = await scopesFor(caller, "core:roles:manage");

  if (scopes.kind !== "all") throw new AppError(CORE_ERRORS.forbidden);
}

/**
 * Whether the recipient is a disabled person: `not-found` for a person who is erased, the
 * break-glass account or no row, and for a group with no row. An archived group is read.
 */
async function recipientDisabled(
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
    holder: { type: raw.holderType, id: raw.holderId, name: raw.holderName },
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

  const personDisabled = await recipientDisabled(input.tenant, input.recipient);

  const entitled = await entitlementByModule(input.tenant, input.modules);

  const result = await input.tenant.db.$client.query<RawPath>(
    `${PATHS_SQL} and ${RECIPIENT_FILTER[input.recipient.type]} ${ORDER_SQL}`,
    [input.recipient.id]
  );

  return result.rows.map((raw) =>
    toPath(raw, {
      personDisabled,
      moduleOff: raw.moduleId !== null && entitled.get(raw.moduleId) !== true,
    })
  );
}

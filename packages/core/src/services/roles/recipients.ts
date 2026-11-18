import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { likePattern } from "../../utils/like-pattern.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { groupLabelSql } from "../groups/label.ts";
import { groupMemberCountSql } from "../groups/member-count.ts";
import { assertManagesAllRoles } from "./effective-access.ts";

export type RecipientRow =
  | {
      readonly type: "group";
      readonly id: string;
      /** The group's label (`groupLabelSql`). */
      readonly name: string;
      /** "idp" for a directory group, "local" for one made here (G14). */
      readonly source: "idp" | "local";
      /** Without the break-glass account (`groupMemberCountSql`). */
      readonly memberCount: number;
      readonly archived: boolean;
      /** The group's own `role_assignment` rows. */
      readonly assignedRoles: number;
    }
  | {
      readonly type: "user";
      readonly id: string;
      readonly name: string;
      readonly email: string;
      /** The person's own `role_assignment` rows; the roles of their groups are not counted. */
      readonly assignedRoles: number;
    };

export type RecipientPage = {
  readonly rows: readonly RecipientRow[];
  /** Every match before the page is cut. */
  readonly total: number;
};

export const RECIPIENT_PAGE_SIZE = 25;

type RawRecipient = {
  readonly type: "group" | "user";
  readonly id: string;
  readonly name: string;
  readonly source: string | null;
  readonly memberCount: number | null;
  readonly archived: boolean | null;
  readonly email: string | null;
  readonly assignedRoles: number;
};

/** A recipient's own `role_assignment` rows; `id` is the caller's fixed text expression. */
const ownAssignmentsSql = (type: "group" | "user", id: string) =>
  `(select count(*) from role_assignment a
     where a.principal_type = '${type}' and a.principal_id = ${id})::int`;

function toRow(raw: RawRecipient): RecipientRow {
  return raw.type === "group"
    ? {
        type: "group",
        id: raw.id,
        name: raw.name,
        source: raw.source === "idp" ? "idp" : "local",
        memberCount: raw.memberCount ?? 0,
        archived: raw.archived === true,
        assignedRoles: raw.assignedRoles,
      }
    : {
        type: "user",
        id: raw.id,
        name: raw.name,
        email: raw.email ?? "",
        assignedRoles: raw.assignedRoles,
      };
}

/**
 * The groups and people that Access offers (d8l5.62, P12-6): groups first, then people, each by
 * name and then id, searched and paged on the server. A person is never the break-glass account
 * and never erased (R-39), as `readGrantRecipients` reads them; an archived group shows only when
 * asked. The read decides nothing: `can()` and `scopesFor()` stay the only checks (DEC-39).
 */
export async function readRecipients(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly query: string;
  readonly kind: "all" | "group" | "user";
  /** Narrows to these ids, for an id named in the address. */
  readonly ids: readonly string[] | null;
  /** Archived groups too: Grants lists them, the pickers do not. */
  readonly archived: boolean;
  readonly offset: number;
  readonly limit: number;
}): Promise<RecipientPage> {
  await assertManagesAllRoles(input.caller);

  const values: (string | number | readonly string[])[] = [];

  const param = (value: string | number | readonly string[]) => {
    values.push(value);

    return `$${values.length}`;
  };

  const term = input.query.trim();
  const like = term === "" ? null : param(likePattern(term));
  // A text compare, so a malformed id matches nothing and never casts.
  const ids = input.ids === null ? null : param(input.ids);

  const branches: string[] = [];

  if (input.kind !== "user") {
    let where = input.archived ? "true" : "g.archived_at is null";

    if (like !== null) {
      where += ` and ${groupLabelSql("g")} ilike ${like} escape '\\'`;
    }

    if (ids !== null) where += ` and g.id::text = any(${ids}::text[])`;

    branches.push(`select 'group' as type, g.id::text as id, ${groupLabelSql("g")} as name,
              g.source, ${groupMemberCountSql("g")} as "memberCount",
              (g.archived_at is not null) as archived, null::text as email,
              ${ownAssignmentsSql("group", "g.id::text")} as "assignedRoles"
         from "group" g where ${where}`);
  }

  if (input.kind !== "group") {
    let where = "u.is_break_glass = false and u.erased_at is null";

    if (like !== null) {
      where += ` and (u.name ilike ${like} escape '\\' or u.email ilike ${like} escape '\\')`;
    }

    if (ids !== null) where += ` and u.id = any(${ids}::text[])`;

    branches.push(`select 'user' as type, u.id, u.name, null::text as source,
              null::int as "memberCount", null::boolean as archived, u.email,
              ${ownAssignmentsSql("user", "u.id")} as "assignedRoles"
         from "user" u where ${where}`);
  }

  const recipients = branches.join(" union all ");

  const total =
    (
      await input.tenant.db.$client.query<{ readonly total: number }>(
        `select count(*)::int as total from (${recipients}) r`,
        values
      )
    ).rows[0]?.total ?? 0;

  const result = await input.tenant.db.$client.query<RawRecipient>(
    `select * from (${recipients}) r
      order by r.type = 'user', lower(r.name), r.id
     offset ${param(input.offset)} limit ${param(input.limit)}`,
    values
  );

  return { rows: result.rows.map(toRow), total };
}

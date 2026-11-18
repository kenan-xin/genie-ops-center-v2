/**
 * A group's member count as every read shows it: its `group_member` rows without the break-glass
 * account, which appears only in the audit log (R-39). The Groups list, the Grants recipients and
 * the role page count with this one expression, so their counts agree. `alias` is the caller's
 * fixed alias for the `group` row, never input.
 */
export function groupMemberCountSql(alias: string): string {
  return `(select count(*) from group_member m join "user" u on u.id = m.user_id
     where m.group_id = ${alias}.id and u.is_break_glass = false)::int`;
}

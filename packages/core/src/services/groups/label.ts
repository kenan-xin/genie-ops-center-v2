/**
 * A group's name as every read shows it: the display label when an administrator set one, else the
 * value the identity provider sends (R-24c). Every SQL read that names a group uses this one
 * expression, so no screen shows an object id where a label exists. `alias` is the caller's fixed
 * alias for the `group` row, never input.
 */
export function groupLabelSql(alias: string): string {
  return `coalesce(${alias}.display_label, ${alias}.name)`;
}

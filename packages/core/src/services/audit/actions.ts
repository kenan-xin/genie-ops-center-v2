/**
 * The one catalogue of audit action strings core writes (R-45).
 *
 * Sign-in and session actions carry the `auth:` prefix. Administration actions carry the `core:`
 * prefix and name the object and the verb. Operator rows keep the `ops:<command>` form that
 * `DEC-45` fixes: they are not a fixed list, so they are matched by prefix rather than enumerated
 * here, and the reader gives them their own filter (R-68). The audit reader's action filter groups
 * this fixed list by the prefix before the first colon, so a module never invents an action the
 * filter cannot offer.
 *
 * The list is append-only in spirit: an action already written stays readable even after a later
 * release stops writing it, so a reader that grouped by "actions that appear in the tenant" would
 * lose a filter option the moment its last row was erased. Keep retired actions in the catalogue.
 */
export const AUDIT_ACTIONS = [
  // Sign-in and session (Section 2).
  "auth:sign_in",
  "auth:sign_in_refused",
  "auth:sign_out",
  "auth:groups_claim_absent",
  "auth:rate_limited",
  "auth:break_glass_sign_in",
  "auth:break_glass_password_changed",
  "auth:break_glass_authenticator_enrolled",
  // Administration (Section 2).
  "core:person_added",
  "core:role_assignment_added",
  "core:role_assignment_removed",
  "core:role_created",
  "core:role_updated",
  "core:role_deleted",
  "core:invitation_sent",
  "core:set_password_sent",
  "core:directory_group_added",
  "core:directory_group_deleted",
  "core:group_label_changed",
  "core:group_archived",
  "core:local_group_added",
  "core:local_group_updated",
  "core:local_group_deleted",
  "core:group_member_added",
  "core:group_member_removed",
  "core:group_members_removed",
  // Permission evolution writes this one from the migrator (R-33c).
  "core:permission_transformation",
] as const;

/** One action string the reader's fixed filter offers. */
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * The group an action key belongs to: the prefix before the first colon. `solutions:status:changed`
 * answers `solutions`, and the reader renders the group label from it.
 */
export function auditActionGroup(action: string): string {
  const [group] = action.split(":");

  return group ?? action;
}

/**
 * True for an operator row (R-68, DEC-45): an action of the `ops:<command>` form. The reader's
 * operator filter also requires a null actor, because a person could in principle carry an
 * `ops:`-prefixed key; both halves are required.
 */
export function isOperatorAction(action: string): boolean {
  return action.startsWith("ops:") && action.length > "ops:".length;
}

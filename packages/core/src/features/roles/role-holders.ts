import type { RoleAssignment } from "./types.ts";

/**
 * The role detail's holders as one sentence (R-29b): distinct groups and people, so a holder at two
 * scopes counts once. Who holds the role at which scope is read in Access.
 */
export function holdersSentence(
  assignments: readonly Pick<RoleAssignment, "principalType" | "principalId">[]
): string {
  const count = (type: RoleAssignment["principalType"]) =>
    new Set(
      assignments.flatMap((assignment) =>
        assignment.principalType === type ? [assignment.principalId] : []
      )
    ).size;

  const groups = count("group");

  const people = count("user");

  const parts = [
    groups === 0 ? null : `${groups} ${groups === 1 ? "group" : "groups"}`,
    people === 0 ? null : `${people} ${people === 1 ? "person" : "people"}`,
  ].filter((part) => part !== null);

  if (parts.length === 0) return "Nobody holds this role yet.";

  return `${parts.join(" and ")} ${groups + people === 1 ? "holds" : "hold"} this role.`;
}

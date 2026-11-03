import type { Scope } from "../../lib/module-contract/keys.ts";
import type {
  AdvancedCatalogue,
  AdvancedChanges,
  AdvancedOption,
} from "../../services/roles/advanced.ts";

/** One role that Advanced access stages, with the record it points at (R-37c). */
export type AdvancedAdd = {
  readonly option: AdvancedOption;
  readonly scope: Scope | null;
  /** The record's label, shown on the staged row. */
  readonly label: string | null;
};

/** The staged changes of the sheet: adds, and the assignment ids to remove. */
export type AdvancedDraft = {
  readonly add: readonly AdvancedAdd[];
  readonly remove: readonly string[];
};

export const EMPTY_ADVANCED_DRAFT: AdvancedDraft = { add: [], remove: [] };

/** The key of one record scope in a labels map. */
export const scopeKey = (scope: Scope): string =>
  `${scope.type}\u0000${scope.id}`;

/**
 * The add that a `?role=` link stages in Advanced access (AD12): a core role, or a core custom
 * role, for the whole tenant, unless the recipient holds it directly already. A module role
 * answers null, because a whole-tenant module role is a Grants row.
 */
export function advancedLinkAdd(input: {
  readonly catalogue: AdvancedCatalogue;
  /** The ids of the roles the recipient holds directly for the whole tenant. */
  readonly held: ReadonlySet<string>;
  readonly roleId: string | undefined;
}): AdvancedAdd | null {
  const option = [...input.catalogue.core, ...input.catalogue.custom].find(
    (candidate) =>
      candidate.roleId === input.roleId && candidate.moduleId === null
  );

  if (
    option === undefined ||
    !option.enabled ||
    input.held.has(option.roleId)
  ) {
    return null;
  }

  return { option, scope: null, label: null };
}

/** The `roles.saveAdvanced` payload of a draft (AD4). */
export function advancedSaveInput(draft: AdvancedDraft): AdvancedChanges {
  return {
    add: draft.add.map((entry) => ({
      roleId: entry.option.roleId,
      scope: entry.scope,
    })),
    remove: draft.remove.map((assignmentId) => ({ assignmentId })),
  };
}

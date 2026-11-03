import type { Scope } from "../../lib/module-contract/keys.ts";
import type {
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

import { omit } from "es-toolkit";
import { devtools } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";

export type GrantsDraft = {
  /** Row id to role id. */
  readonly add: Readonly<Record<string, string>>;
  /** Row id to role id. */
  readonly change: Readonly<Record<string, string>>;
  readonly remove: readonly string[];
};

export type GrantsDraftState = GrantsDraft & {
  readonly stageAdd: (
    rows: readonly { readonly row: string; readonly roleId: string }[]
  ) => void;
  readonly stageRemove: (rows: readonly string[]) => void;
  readonly setRole: (
    row: string,
    roleId: string,
    savedRoleId: string | undefined
  ) => void;
  readonly reset: (next?: GrantsDraft) => void;
};

export const EMPTY_DRAFT: GrantsDraft = { add: {}, change: {}, remove: [] };

export type DraftCounts = {
  readonly add: number;
  readonly change: number;
  readonly remove: number;
};

/**
 * The staged changes of the Access Grants tab (R-37a, P19). Nothing is written until Save. Add
 * then Remove of one row cancels out, and Remove then Add restores the row. One store per mount,
 * so stories and tests never share a draft.
 */
export function createGrantsDraftStore(): StoreApi<GrantsDraftState> {
  return createStore<GrantsDraftState>()(
    devtools(
      (set) => ({
        ...EMPTY_DRAFT,
        stageAdd: (rows) =>
          set((state) => {
            const restored = new Set(
              rows
                .map(({ row }) => row)
                .filter((row) => state.remove.includes(row))
            );

            const added = rows
              .filter(({ row }) => !restored.has(row))
              .map(({ row, roleId }) => [row, roleId]);

            return {
              add: { ...state.add, ...Object.fromEntries(added) },
              remove: state.remove.filter((row) => !restored.has(row)),
            };
          }),
        stageRemove: (rows) =>
          set((state) => {
            const cancelled = rows.filter((row) => row in state.add);

            const removed = rows.filter(
              (row) => !(row in state.add) && !state.remove.includes(row)
            );

            return {
              add: omit(state.add, cancelled),
              change: omit(state.change, removed),
              remove: [...state.remove, ...removed],
            };
          }),
        setRole: (row, roleId, savedRoleId) =>
          set((state) => {
            if (savedRoleId === undefined) {
              return { add: { ...state.add, [row]: roleId } };
            }

            return {
              change:
                roleId === savedRoleId
                  ? omit(state.change, [row])
                  : { ...state.change, [row]: roleId },
            };
          }),
        reset: (next = EMPTY_DRAFT) => set({ ...next }),
      }),
      // The middleware switches itself off in a production build and without the extension.
      { name: "access-grants" }
    )
  );
}

export function draftCounts(draft: GrantsDraft): DraftCounts {
  return {
    add: Object.keys(draft.add).length,
    change: Object.keys(draft.change).length,
    remove: draft.remove.length,
  };
}

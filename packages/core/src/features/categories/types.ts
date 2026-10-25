/**
 * The presentation types of the Categories screen. A browser-safe feature folder may not import the
 * server service, so these mirror `CategoryRow` and `CategoryList` of `services/categories/index.ts`
 * and stay structurally compatible with them.
 */

export type CategoryRowView = {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  /** Placeable modules in this category; never a solution (R-88). */
  readonly moduleCount: number;
};

export type CategoryListView = {
  /** In display order. */
  readonly categories: readonly CategoryRowView[];
  /** Placeable modules under no category, or under one that no longer exists: the Other row (R-91). */
  readonly ungroupedCount: number;
};

/** A module with a workspace entry, on or off (Decision 6, R-91a). */
export type AssignableModuleView = {
  readonly id: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly categoryId: string | null;
};

export type CategoriesScreenProps = {
  readonly list: CategoryListView;
  readonly modules: readonly AssignableModuleView[];
  readonly onCreate: (name: string) => void;
  readonly onRename: (id: string, name: string) => void;
  /** The full id list in the new order (Decision 8). */
  readonly onReorder: (orderedIds: readonly string[]) => void;
  readonly onDelete: (id: string) => void;
  readonly onAssign: (moduleId: string, categoryId: string | null) => void;
  /** The last refused assignment. Its row keeps the server value and offers Retry. */
  readonly failed?:
    | { readonly moduleId: string; readonly message: string }
    | undefined;
  readonly onRetry?: (() => void) | undefined;
  /** A list write is saving: the reorder arrows refuse, and Add and Delete show the loading state. */
  readonly reordering?: boolean | undefined;
  /** The lists are still being read: no rows and no empty state yet. */
  readonly loading?: boolean | undefined;
  /** The lists could not be read: this text replaces the rows. */
  readonly error?: string | undefined;
};

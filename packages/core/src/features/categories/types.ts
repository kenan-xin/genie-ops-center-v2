import type {
  CategoryList as CategoryListView,
  CategoryRow as CategoryRowView,
} from "../../services/categories/index.ts";

/**
 * The presentation types of the Categories screen. The list views come from the categories service
 * through a type-only import, which the browser-safety guard skips. `AssignableModuleView` and the
 * screen props are screen-only, because the screen needs only four fields of a module row.
 */
export type { CategoryListView, CategoryRowView };

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

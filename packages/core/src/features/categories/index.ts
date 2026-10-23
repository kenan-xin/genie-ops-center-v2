/**
 * The browser-safe Categories feature: the screen and its presentation types. It imports no
 * database, no registry and no environment value, so Storybook and the application both render it.
 */
export { CategoriesScreen } from "./categories-screen.tsx";

export {
  type AssignableModuleView,
  type CategoriesScreenProps,
  type CategoryListView,
  type CategoryRowView,
} from "./types.ts";

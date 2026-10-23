/**
 * The browser-safe Modules feature: the screen and its presentation types. It imports no database,
 * no registry and no environment value, so Storybook and the application both render it.
 */
export { ModulesScreen } from "./modules-screen.tsx";

export {
  type CategoryOption,
  type ModuleHolderView,
  type ModuleRefusal,
  type ModulesScreenProps,
  type ModuleView,
} from "./types.ts";

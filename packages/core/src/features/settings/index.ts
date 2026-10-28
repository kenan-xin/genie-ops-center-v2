/**
 * The browser-safe Tenant Settings feature: the screen and its presentation types. It imports no
 * database, no registry and no environment value, so Storybook and the application both render it.
 */
export { TenantSettingsScreen } from "./settings-screen.tsx";

export { resolveSettingsTarget } from "./settings-target.ts";

export type {
  CoreSettingsView,
  LastChangedView,
  ModelKeyInput,
  ModelSettingsInput,
  ModuleSettingsView,
  ReportingInput,
  SessionsInput,
  SettingsView,
  SignInInput,
  TenantSettingsScreenProps,
} from "./types.ts";

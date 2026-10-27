import type { ConfigValue } from "@genie/ui";

import type {
  CoreSettingsView,
  LastChanged as LastChangedView,
  ModuleSettingsView,
  SettingsView,
} from "../../services/settings/index.ts";

/**
 * The presentation types of the Tenant Settings screen. The views come from the settings service
 * through a type-only import, which the browser-safety guard skips. The save inputs, the field issue
 * and the screen props are screen-only, because they describe what the form sends and draws.
 */
export type {
  CoreSettingsView,
  LastChangedView,
  ModuleSettingsView,
  SettingsView,
};

export type SignInInput = {
  readonly onboardingMode: "invite" | "jit";
  readonly localAccountsEnabled: boolean;
};

/** A server issue for one field: the message to show under the field `path` names. */
export type SettingsIssue = {
  readonly path: string;
  readonly message: string;
};

export type SessionsInput = { readonly sessionIdleMinutes: number };

export type TenantSettingsScreenProps = {
  /** Undefined while the first read runs. */
  readonly settings: SettingsView | undefined;
  readonly loading?: boolean | undefined;
  /** The read failed: this text replaces the page. */
  readonly error?: string | undefined;
  /** The `?section=&field=` of the address. */
  readonly target: {
    readonly section?: string | undefined;
    readonly field?: string | undefined;
  };
  readonly timeZone: string;
  readonly modulesHref: string;
  /** Why local accounts are off when the realm holds none, for each `realmMode`. */
  readonly localAccountsNotes: {
    readonly managed: string;
    readonly customer: string;
  };
  /**
   * Each save rejects with `{ message, issues? }` when the server refuses; the edits stay. The
   * message is the whole failure copy and shows as given in the section's action bar, and each
   * issue shows under the field whose id equals its `path` (DR-20 S3-06). A save carries only the fields the person changed, and a
   * cleared module field is null, so a stale form never writes back another administrator's
   * change (admin M-1).
   */
  readonly onSaveSignIn: (input: Partial<SignInInput>) => Promise<void>;
  readonly onSaveSessions: (input: SessionsInput) => Promise<void>;
  readonly onSaveModule: (
    moduleId: string,
    values: Record<string, ConfigValue | null>
  ) => Promise<void>;
  /** The host writes the opened section into the address. */
  readonly onTargetChange: (target: { readonly section: string }) => void;
};

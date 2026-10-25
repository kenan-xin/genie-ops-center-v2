import type { ConfigFormField, ConfigFormSchema, ConfigValue } from "@genie/ui";

/**
 * The presentation types of the Tenant Settings screen. A browser-safe feature folder may not import
 * the server service, so these mirror the views of `services/settings/index.ts` and stay
 * structurally compatible with them.
 */

/** Who changed a section last, and when. `by` is null for a write no person made. */
export type LastChangedView = {
  readonly by: string | null;
  readonly at: string;
} | null;

export type CoreSettingsView = {
  readonly onboardingMode: "invite" | "jit";
  readonly localAccountsEnabled: boolean;
  readonly realmMode: "managed" | "customer";
  readonly realmSupportsLocalAccounts: boolean;
  readonly sessionIdleMinutes: number;
  readonly lastChanged: LastChangedView;
};

export type ModuleSettingsView = {
  readonly moduleId: string;
  readonly title: string;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly schema: ConfigFormSchema;
  readonly fields: readonly ConfigFormField[];
  readonly values: Record<string, ConfigValue>;
  readonly lastChanged: LastChangedView;
};

export type SettingsView = {
  readonly core: CoreSettingsView;
  readonly modules: readonly ModuleSettingsView[];
};

export type SignInInput = {
  readonly onboardingMode: "invite" | "jit";
  readonly localAccountsEnabled: boolean;
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
  /** Each save rejects with `{ message }` when the server refuses; the edits stay. */
  readonly onSaveSignIn: (input: SignInInput) => Promise<void>;
  readonly onSaveSessions: (input: SessionsInput) => Promise<void>;
  readonly onSaveModule: (
    moduleId: string,
    values: Record<string, ConfigValue>
  ) => Promise<void>;
  /** The host writes the opened section into the address. */
  readonly onTargetChange: (target: { readonly section: string }) => void;
};

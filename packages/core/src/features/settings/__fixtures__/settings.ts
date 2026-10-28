import type { ModuleSettingsView, SettingsView } from "../types.ts";

/** The placeholder module's section as the service builds it. */
export const FIXTURE_PLACEHOLDER: ModuleSettingsView = {
  moduleId: "placeholder",
  title: "Placeholder",
  description: null,
  enabled: true,
  schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        minLength: 1,
        maxLength: 60,
        default: "Placeholder",
      },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      enabled: { type: "boolean", default: false },
      mode: { type: "string", enum: ["basic", "advanced"], default: "basic" },
      tags: {
        type: "array",
        items: { type: "string", pattern: "^[a-z0-9-]+$" },
        maxItems: 5,
        default: [],
      },
    },
  },
  fields: [
    { id: "title", title: "Title" },
    { id: "pageSize", title: "Page size" },
    { id: "enabled", title: "Enabled" },
    { id: "mode", title: "Mode" },
    { id: "tags", title: "Tags" },
  ],
  values: {
    title: "Placeholder",
    pageSize: 20,
    enabled: false,
    mode: "basic",
    tags: [],
  },
  lastChanged: null,
};

export const FIXTURE_SETTINGS: SettingsView = {
  core: {
    onboardingMode: "invite",
    localAccountsEnabled: false,
    realmMode: "managed",
    realmSupportsLocalAccounts: true,
    sessionIdleMinutes: 15,
    reportingDate: null,
    allowedModels: [],
    chatModel: null,
    documentModel: null,
    modelKeyStored: false,
    lastChanged: { by: "Ada Lovelace", at: "2026-10-20T09:30:00.000Z" },
  },
  modules: [FIXTURE_PLACEHOLDER],
};

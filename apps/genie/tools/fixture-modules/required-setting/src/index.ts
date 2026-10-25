import { implementModule, type Module } from "@genie/core";
import { z } from "zod";

/** The fixture's empty API. The declaration and the router must name this one object. */
const contract = {};

/**
 * The one module whose configuration declares a required value with no default, and only in the
 * fixture image (Spec 3 AC-11b). A first enable with `endpoint` unset is refused, so the
 * acceptance proof shows the refusal, a Tenant Settings save that keeps the module off, and then
 * the enable. Its `use` key and default role let the proof check that enabling grants nothing.
 */
const requiredSettingModule = {
  identity: {
    id: "required-setting",
    displayName: "Required setting fixture",
    version: "0.0.0",
  },

  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_required_setting",
  },

  contract,

  router: implementModule("required-setting", contract).router({}),

  permissions: [
    { key: "required-setting:use", label: "Use the required setting fixture" },
  ],

  recordTypes: [],

  defaultRoles: [
    {
      name: "Required setting fixture user",
      permissions: ["required-setting:use"],
    },
  ],

  navigation: { pinned: [], entries: [] },

  pages: { workspace: {}, admin: {} },

  configuration: {
    schema: z.object({ endpoint: z.string().min(1).max(200) }),
    section: { id: "required-setting", title: "Required setting fixture" },
    fields: { endpoint: { id: "endpoint", title: "Endpoint" } },
  },

  events: [],

  capabilities: [],

  jobs: [],

  inboundEndpoints: [],

  integrationKinds: [],

  tests: { presets: [] },
} satisfies Module;

export { requiredSettingModule };

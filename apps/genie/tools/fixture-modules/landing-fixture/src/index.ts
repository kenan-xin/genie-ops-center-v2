import { implementModule, type Module } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";
import { createElement } from "react";

/** The fixture's empty API. The declaration and the router must name this one object. */
const contract = {};

const home = {
  id: "landing-fixture-home",
  label: "Landing fixture",
  path: "/m/landing-fixture",
  surface: "workspace",
  requiredPermission: "landing-fixture:use",
  landing: true,
} as const;

/**
 * The one module that carries the landing flag, and only in the fixture image (Spec 3 AC-4). The
 * shipped placeholder keeps none (DEC-49), so the landing route is proved end to end here: a
 * person holding `landing-fixture:use` lands on `/m/landing-fixture` after sign-in.
 */
const landingFixtureModule = {
  identity: {
    id: "landing-fixture",
    displayName: "Landing fixture",
    version: "0.0.0",
  },

  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_landing_fixture",
  },

  contract,

  router: implementModule("landing-fixture", contract).router({}),

  permissions: [
    { key: "landing-fixture:use", label: "Use the landing fixture" },
  ],

  recordTypes: [],

  defaultRoles: [
    { name: "Landing fixture user", permissions: ["landing-fixture:use"] },
  ],

  navigation: { pinned: [], entries: [home] },

  pages: {
    workspace: {
      home: () =>
        createElement(
          "main",
          null,
          createElement(PageHeader, { title: "Landing fixture" })
        ),
    },
    admin: {},
  },

  events: [],

  capabilities: [],

  jobs: [],

  inboundEndpoints: [],

  integrationKinds: [],

  tests: { presets: [] },
} satisfies Module;

export { landingFixtureModule };

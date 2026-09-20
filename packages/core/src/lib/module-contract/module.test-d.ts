import { validModule } from "./__fixtures__/valid-module.ts";
import type { Module } from "./module.ts";

/**
 * Type assertions. Vitest does not run this file: the unit preset does not enable typecheck and
 * its collection glob matches `.test.ts` files only, never `.test-d.ts`. The `typecheck` target
 * compiles it because the core tsconfig includes every `src` TypeScript file, and every
 * `@ts-expect-error` below must keep matching a real error or `tsc` fails with "Unused
 * '@ts-expect-error' directive".
 *
 * One assertion per declaration point the type system can police, so a widened field fails the
 * typecheck rather than waiting for a runtime test that may never reach it.
 */

// The fixture satisfies every point of the contract.
export const assigns: Module = validModule;

// 1. Identity: present, and each field typed.
// @ts-expect-error identity is missing
export const missingIdentity: Module = { ...validModule, identity: undefined };

export const badId: Module = {
  ...validModule,
  // @ts-expect-error id must be a string
  identity: { ...validModule.identity, id: 7 },
};

export const missingVersion: Module = {
  ...validModule,
  // @ts-expect-error version is part of the identity
  identity: { id: "fixture", displayName: "Fixture" },
};

// 2. Schema: the migration history is named, not inferred.
export const schemaWithoutHistory: Module = {
  ...validModule,
  // @ts-expect-error migrationsTable is part of the schema point
  schema: {
    tables: validModule.schema.tables,
    migrationsFolder: "drizzle",
  },
};

// 3. Router: a plain object is not a tRPC router.
export const routerIsNotAnObject: Module = {
  ...validModule,
  // @ts-expect-error the router is a tRPC router
  router: { query: () => null },
};

// 4. Permission keys: `<id>:<action>`, with a label.
export const permissionWithoutAction: Module = {
  ...validModule,
  // @ts-expect-error a permission key holds a colon
  permissions: [{ key: "fixture", label: "Fixture" }],
};

export const permissionWithoutLabel: Module = {
  ...validModule,
  // @ts-expect-error a permission declaration carries a label
  permissions: [{ key: "fixture:read" }],
};

// 5. Record types: `resolve` answers a descriptor, and `path` is optional.
export const resolverReturnsAString: Module = {
  ...validModule,
  recordTypes: [
    // @ts-expect-error resolve answers a RecordDescriptor, not a string
    { type: "fixture_record", resolve: async () => "Fixture" },
  ],
};

export const descriptorWithoutPath: Module = {
  ...validModule,
  recordTypes: [
    { type: "fixture_record", resolve: async () => ({ label: "One" }) },
  ],
};

// 6. Default roles: permission keys, never free text.
export const roleWithFreeTextPermission: Module = {
  ...validModule,
  // @ts-expect-error a role grants permission keys
  defaultRoles: [{ name: "Fixture user", permissions: ["use"] }],
};

// 7. Navigation: two surfaces only, and both lists are present.
export const navigationWithAThirdSurface: Module = {
  ...validModule,
  navigation: {
    pinned: [],
    entries: [
      {
        ...validModule.navigation.entries[0]!,
        // @ts-expect-error a surface is workspace or admin
        surface: "dashboard",
      },
    ],
  },
};

export const navigationWithoutPinned: Module = {
  ...validModule,
  // @ts-expect-error the pinned rail is part of the navigation point
  navigation: { entries: validModule.navigation.entries },
};

// 8. Pages: React components, keyed by name, on both surfaces.
export const pageIsAString: Module = {
  ...validModule,
  // @ts-expect-error a page is a component type
  pages: { workspace: { home: "HomePage" }, admin: {} },
};

// 9. Category assignment: optional, and complete when present. An optional
// point is omitted rather than set to undefined, because the core tsconfig
// turns on `exactOptionalPropertyTypes`.
const { categoryAssignment: _noProvider, ...withoutProvider } = validModule;

export const withoutCategoryAssignment: Module = withoutProvider;

export const partialCategoryAssignment: Module = {
  ...validModule,
  // @ts-expect-error a category provider also clears an assignment
  categoryAssignment: {
    listAssignable: async () => [],
    assign: async () => {},
  },
};

// 10. Configuration: optional, and a zod object when present.
const { configuration: _noConfiguration, ...withoutConfig } = validModule;

export const withoutConfiguration: Module = withoutConfig;

export const configurationSchemaIsPlain: Module = {
  ...validModule,
  configuration: {
    // @ts-expect-error a configuration schema is a zod object
    schema: { title: "string" },
    section: { id: "fixture", title: "Fixture" },
    fields: {},
  },
};

// 11. Events: an integer version beside the payload schema.
export const eventWithoutVersion: Module = {
  ...validModule,
  events: [
    // @ts-expect-error an event declaration carries a version
    { name: "fixture.record.created", payload: validModule.events[0]!.payload },
  ],
};

// 12. Capabilities: a name the CapabilityInterfaces registry holds. Section 0
// registers none, so the empty list is the only list that compiles.
export const noCapabilities: Module = { ...validModule, capabilities: [] };

export const inventedCapability: Module = {
  ...validModule,
  // @ts-expect-error no capability of that name is registered
  capabilities: [{ name: "fixture-capability" }],
};

// 13. Jobs: the handler receives the tenant context first.
export const jobHandlerWithoutContext: Module = {
  ...validModule,
  // @ts-expect-error a job handler answers a promise
  jobs: [{ name: "fixture.cleanup", handler: () => "done" }],
};

// 14. Inbound endpoints: one path, one request handler.
export const endpointReturnsAString: Module = {
  ...validModule,
  // @ts-expect-error an endpoint answers a Response
  inboundEndpoints: [{ path: "/fixture/hooks", handle: async () => "ok" }],
};

// 15. Integration kinds: strings.
export const integrationKindIsANumber: Module = {
  ...validModule,
  // @ts-expect-error an integration kind is a string
  integrationKinds: [7],
};

// 16. Content security policy: optional, and origins only.
const { contentSecurityPolicy: _noPolicy, ...withoutPolicy } = validModule;

export const withoutContentSecurityPolicy: Module = withoutPolicy;

export const frameOriginsAreSynchronous: Module = {
  ...validModule,
  // @ts-expect-error frameOrigins answers a promise
  contentSecurityPolicy: { frameOrigins: () => ["https://example.com"] },
};

// 17. Tests: the shared presets, named.
export const testsWithoutPresets: Module = {
  ...validModule,
  // @ts-expect-error the tests point names its presets
  tests: {},
};

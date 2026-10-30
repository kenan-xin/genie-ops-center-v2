import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  capability,
  defineAgentTool,
  type DocumentInbox,
} from "../../../contracts/index.ts";
import {
  implementModule,
  type ModuleContract,
  type ModuleImplementer,
  type ModuleRouter,
} from "../rpc/implement-module.ts";
import { oc } from "../rpc/index.ts";
import {
  renameModule,
  withAdminLanding,
  withForeignAdminPermission,
  withLanding,
} from "./__fixtures__/invalid-modules.ts";
import { fixtureApi, validModule } from "./__fixtures__/valid-module.ts";
import {
  type DatasetDeclaration,
  definePage,
  type JobRetry,
  type Module,
  type ModulePage,
  type NavigationEntry,
} from "./module.ts";
import { validateModule, validateRegistry } from "./validate.ts";

/** The fixture with the given contract and the router `build` makes from core's implementer. */
function withApi<TContract extends ModuleContract>(
  contract: TContract,
  build: (os: ModuleImplementer<TContract>) => ModuleRouter
) {
  return {
    ...validModule,
    contract,
    router: build(implementModule("fixture", contract)),
  };
}

describe("validateModule", () => {
  it("accepts the valid fixture", () => {
    expect(validateModule(validModule)).toEqual([]);
  });

  it.each([
    "core",
    "audit",
    "groups",
    "people",
    "roles",
    "modules",
    "categories",
    "settings",
    "branding",
    "agent",
    "ask",
    "m",
    "admin",
    "api",
    "viewer",
    "account",
    "auth",
    "sign-in",
    "login",
    "setup-required",
    "module-disabled",
  ])("reserves the module id %s", (id) => {
    expect(validateModule(renameModule(validModule, id))).toContain(
      `Module id "${id}" is reserved for core.`
    );
  });

  it.each(["user", "group", "role"])(
    "reserves the record type %s for core",
    (type) => {
      const module = {
        ...validModule,
        recordTypes: [{ ...validModule.recordTypes[0]!, type }],
      };

      expect(validateModule(module)).toContain(
        `Record type "${type}" is reserved for core.`
      );
    }
  );

  it("accepts an equivalent rename to a declared key from a retired one", () => {
    const renamed = {
      ...validModule,
      permissionTransformations: [
        {
          id: "0001",
          release: "1.1.0",
          description: "Rename view to read",
          change: {
            kind: "rename",
            from: "fixture:view",
            to: "fixture:read",
          },
        },
      ],
    } as const;

    expect(validateModule(renamed)).toEqual([]);
  });

  it("accepts a chain of renames whose final key is declared", () => {
    const chained = {
      ...validModule,
      permissionTransformations: [
        {
          id: "0001",
          release: "1.0.0",
          description: "Rename look to view",
          change: { kind: "rename", from: "fixture:look", to: "fixture:view" },
        },
        {
          id: "0002",
          release: "5.0.0",
          description: "Rename view to read",
          change: { kind: "rename", from: "fixture:view", to: "fixture:read" },
        },
      ],
    } as const;

    expect(validateModule(chained)).toEqual([]);
  });

  it("refuses a chain whose intermediate key is still declared", () => {
    const merged = {
      ...validModule,
      permissionTransformations: [
        {
          id: "0001",
          release: "1.0.0",
          description: "Rename look to use",
          change: { kind: "rename", from: "fixture:look", to: "fixture:use" },
        },
        {
          id: "0002",
          release: "5.0.0",
          description: "Rename use to read",
          change: { kind: "rename", from: "fixture:use", to: "fixture:read" },
        },
      ],
    } as const;

    expect(validateModule(merged)).toEqual([
      'Permission transformation "0001" renames "fixture:use", which the module still declares; a rename must not merge two keys.',
      'Permission transformation "0002" renames "fixture:use", which the module still declares; a rename must not merge two keys.',
    ]);
  });

  it("refuses a rename that merges two declared keys, a foreign key and a core role rename", () => {
    const broken = {
      ...validModule,
      permissionTransformations: [
        {
          id: "0001",
          release: "1.1.0",
          description: "Merge read into admin",
          change: {
            kind: "rename",
            from: "fixture:read",
            to: "fixture:admin",
          },
        },
        {
          id: "0002",
          release: "1.1.0",
          description: "Revoke a core key",
          change: { kind: "revoke", key: "core:people:manage" },
        },
        {
          id: "0003",
          release: "1.1.0",
          description: "Rename to a missing key",
          change: {
            kind: "rename",
            from: "fixture:old",
            to: "fixture:missing",
          },
        },
        {
          id: "0004",
          release: "1.1.0",
          description: "Take over a core role",
          change: {
            kind: "rename-role",
            from: "Fixture user",
            to: "Tenant administrator",
          },
        },
        {
          id: "0004",
          release: "1.1.0",
          description: "A repeated id",
          change: { kind: "revoke", key: "fixture:read" },
        },
      ],
    } as const;

    expect(validateModule(broken)).toEqual([
      'Permission transformation "0001" renames "fixture:read", which the module still declares; a rename must not merge two keys.',
      'Permission transformation "0002" changes "core:people:manage", which is not a key of "fixture".',
      'Permission transformation "0003" renames to "fixture:missing", which the module does not declare.',
      'Permission transformation "0004" renames the core system role "Tenant administrator".',
      'Permission transformation "0004" is declared twice.',
    ]);
  });

  it("rejects a router that implementModule did not build", () => {
    const broken = { ...validModule, router: { ...validModule.router } };

    expect(validateModule(broken)).toEqual([
      'Module "fixture" has a router not built by implementModule("fixture", contract).',
    ]);
  });

  it("rejects a router built by implementModule for another module id", () => {
    const broken = {
      ...validModule,
      router: implementModule("placeholder", validModule.contract).router({
        records: {
          list: implementModule(
            "placeholder",
            validModule.contract
          ).records.list.handler(() => []),
        },
      }),
    };

    expect(validateModule(broken)).toEqual([
      'Module "fixture" has a router built by implementModule("placeholder", ...). It must use "fixture".',
    ]);
  });

  it("rejects a router built from a contract other than the declared one", () => {
    // The same shape and paths, but another contract object: the router answers to that one.
    const broken = { ...validModule, router: fixtureApi("fixture").router };

    expect(validateModule(broken)).toEqual([
      'Module "fixture" has a router built from a contract other than the one it declares.',
    ]);
  });

  it("rejects a contract procedure the router does not implement", () => {
    const contract = {
      ...validModule.contract,
      archive: oc.route({ method: "DELETE", path: "/fixture/records/{id}" }),
    };

    const os = implementModule("fixture", contract);

    // @ts-expect-error the missing `archive` procedure is the point of the case
    const router = os.router({
      records: { list: os.records.list.handler(() => []) },
    });

    expect(validateModule({ ...validModule, contract, router })).toEqual([
      'Module "fixture" declares procedure "archive" that its router does not implement.',
    ]);
  });

  it("rejects a procedure with no route", () => {
    expect(
      validateModule(
        withApi({ read: oc.input(z.object({})) }, (os) =>
          os.router({ read: os.read.handler(() => null) })
        )
      )
    ).toEqual([
      'Procedure "read" of module "fixture" declares no route. Use oc.route({ method, path }).',
    ]);
  });

  it.each<`/${string}`>(["/people/all", "/fixtures"])(
    "rejects the path %s outside the module prefix",
    (path) => {
      expect(
        validateModule(
          withApi({ read: oc.route({ method: "GET", path }) }, (os) =>
            os.router({ read: os.read.handler(() => null) })
          )
        )
      ).toEqual([
        `Procedure "read" of module "fixture" has path "${path}". A module path is "/fixture" or starts with "/fixture/".`,
      ]);
    }
  );

  it("accepts the bare module prefix as the collection path", () => {
    expect(
      validateModule(
        withApi({ read: oc.route({ method: "GET", path: "/fixture" }) }, (os) =>
          os.router({ read: os.read.handler(() => null) })
        )
      )
    ).toEqual([]);
  });

  it("rejects a GET whose input is not an object", () => {
    expect(
      validateModule(
        withApi(
          {
            read: oc
              .route({ method: "GET", path: "/fixture/records/{id}" })
              .input(z.string()),
          },
          (os) => os.router({ read: os.read.handler(() => null) })
        )
      )
    ).toEqual([
      'Procedure "read" of module "fixture" is a GET with an input that is not an object.',
    ]);
  });

  it("accepts a GET with no input and a POST with any input", () => {
    expect(
      validateModule(
        withApi(
          { read: oc.route({ method: "GET", path: "/fixture/records" }) },
          (os) => os.router({ read: os.read.handler(() => null) })
        )
      )
    ).toEqual([]);

    expect(
      validateModule(
        withApi(
          {
            read: oc
              .route({ method: "POST", path: "/fixture/records/{id}/archive" })
              .input(z.string()),
          },
          (os) => os.router({ read: os.read.handler(() => null) })
        )
      )
    ).toEqual([]);
  });

  it("rejects a router procedure the contract does not declare", () => {
    const os = implementModule("fixture", validModule.contract);

    const router = os.router({
      records: { list: os.records.list.handler(() => []) },
      hidden: os.records.list.handler(() => []),
    });

    expect(validateModule({ ...validModule, router })).toEqual([
      'Module "fixture" serves procedure "hidden" that its contract does not declare.',
    ]);
  });

  it("names a missing nested procedure by its dotted path", () => {
    const contract = {
      a: {
        b: oc.route({ method: "POST", path: "/fixture/a/b" }),
        c: oc.route({ method: "POST", path: "/fixture/a/c" }),
      },
    };

    expect(
      validateModule(
        withApi(contract, (os) =>
          // @ts-expect-error the missing `a.b` procedure is the point of the case
          os.router({ a: { c: os.a.c.handler(() => null) } })
        )
      )
    ).toEqual([
      'Module "fixture" declares procedure "a.b" that its router does not implement.',
    ]);
  });

  it("rejects a procedure that validates its input before the gates", () => {
    const os = implementModule("fixture", validModule.contract);

    // SAFETY: `$config` is oRPC's builder method that the implementer's type hides; reaching it
    // through a cast is the escape this case proves validation refuses.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the hidden method has no public type to assert to directly.
    const builder = os.records.list as unknown as {
      $config: (config: {
        initialInputValidationIndex: number;
      }) => typeof os.records.list;
    };

    const early = builder.$config({ initialInputValidationIndex: -100 });
    const router = os.router({ records: { list: early.handler(() => []) } });

    expect(validateModule({ ...validModule, router })).toEqual([
      'Procedure "records.list" of module "fixture" does not run the entitlement gate and the session check before input validation.',
    ]);
  });

  it("rejects a lazy router", () => {
    const contract = {
      a: { b: oc.route({ method: "POST", path: "/fixture/a/b" }) },
    };

    expect(
      validateModule(
        withApi(contract, (os) =>
          os.router({
            a: os.a.lazy(() =>
              Promise.resolve({ default: { b: os.a.b.handler(() => null) } })
            ),
          })
        )
      )
    ).toEqual([
      'Module "fixture" has a lazy router at "a": lazy routers are not supported.',
    ]);
  });

  it("rejects a contract key implementModule reserves", () => {
    const contract = {
      records: {
        use: oc.route({ method: "POST", path: "/fixture/records/use" }),
      },
    };

    expect(
      validateModule(
        withApi(contract, (os) =>
          os.router({ records: { use: os.records.use.handler(() => null) } })
        )
      )
    ).toEqual([
      'Module "fixture" names procedure "records.use" with the key "use", which implementModule reserves.',
    ]);
  });

  it.each([
    [
      "POST",
      "/fixture/../people/b",
      'has path "/fixture/../people/b" with an empty, "." or ".." segment.',
    ],
    [
      "POST",
      "/fixture//records",
      'has path "/fixture//records" with an empty, "." or ".." segment.',
    ],
    [
      "HEAD",
      "/fixture/records",
      "is a HEAD with an input that is not an object.",
    ],
  ] as const)("rejects a %s to %s", (method, path, problem) => {
    expect(
      validateModule(
        withApi({ read: oc.route({ method, path }).input(z.string()) }, (os) =>
          os.router({ read: os.read.handler(() => null) })
        )
      )
    ).toEqual([`Procedure "read" of module "fixture" ${problem}`]);
  });

  it("rejects a job name outside its module prefix", () => {
    const broken = {
      ...validModule,
      jobs: validModule.jobs.map((job) => ({ ...job, name: "other.cleanup" })),
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Job name "other.cleanup" must start with "fixture."'
    );
  });

  it("rejects duplicate job names within one module", () => {
    const broken = {
      ...validModule,
      jobs: [...validModule.jobs, ...validModule.jobs],
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Job name "fixture.cleanup" is declared more than once'
    );
  });

  it("rejects module jobs in the reserved core namespace", () => {
    const broken = {
      ...validModule,
      jobs: validModule.jobs.map((job) => ({
        ...job,
        name: "core.worker-heartbeat",
      })),
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Module "fixture" cannot declare a job in the reserved "core." namespace'
    );
  });

  // A negative or fractional value makes pg-boss refuse the queue at worker start, and the worker
  // then exits on every restart.
  it.each([
    { limit: -1 },
    { limit: 1.5 },
    { limit: 3, delaySeconds: -1 },
    { limit: 3, delaySeconds: 0.5 },
    // SAFETY: a JavaScript module can omit the required limit; the type cannot stop it.
    {} as JobRetry,
  ])("rejects a job retry of %o", (retry) => {
    const broken = {
      ...validModule,
      jobs: validModule.jobs.map((job) => ({ ...job, retry })),
    };

    expect(validateModule(broken)).toContain(
      'Job "fixture.cleanup" declares an invalid retry: a limit and a delay are whole numbers from 0.'
    );
  });

  it("rejects an event declaration with a version below one", () => {
    const broken = {
      ...validModule,
      events: [
        { name: "fixture.record.created", version: 0, payload: z.object({}) },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Event "fixture.record.created" has version 0'
    );
  });

  it("rejects a subscription to an event with a version below one", () => {
    const broken = {
      ...validModule,
      subscriptions: [
        {
          event: {
            name: "fixture.record.created",
            version: 0,
            payload: z.object({}),
          },
          name: "record-created",
          durable: true,
          handler: async () => {},
        },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Subscription to "fixture.record.created" has version 0'
    );
  });

  it("rejects a subscription that sets serializeBy with durable false", () => {
    const broken = {
      ...validModule,
      subscriptions: [
        {
          event: {
            name: "fixture.record.created",
            version: 1,
            payload: z.object({ id: z.string() }),
          },
          durable: false,
          serializeBy: (payload: { id: string }) => payload.id,
          handler: async () => {},
        },
      ],
    };

    expect(validateModule(broken)).toContain(
      'Subscription to "fixture.record.created" sets serializeBy with durable false. serializeBy delivers durably.'
    );
  });

  it("accepts one fast, one durable and one serialized subscription to the same event", () => {
    const contract = {
      name: "fixture.record.created",
      version: 1,
      payload: z.object({ id: z.string() }),
    };

    expect(
      validateModule({
        ...validModule,
        subscriptions: [
          { event: contract, handler: async () => {} },
          {
            event: contract,
            name: "durable",
            durable: true,
            handler: async () => {},
          },
          {
            event: contract,
            name: "serialized",
            serializeBy: (payload: { id: string }) => payload.id,
            handler: async () => {},
          },
        ],
      })
    ).toEqual([]);
  });

  it("rejects a durable subscription with no name", () => {
    const contract = {
      name: "fixture.record.created",
      version: 1,
      payload: z.object({ id: z.string() }),
    };

    const broken = {
      ...validModule,
      subscriptions: [
        { event: contract, durable: true, handler: async () => {} },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Durable subscription to "fixture.record.created" needs a name'
    );
  });

  it("rejects a serialized subscription with no name", () => {
    const contract = {
      name: "fixture.record.created",
      version: 1,
      payload: z.object({ id: z.string() }),
    };

    const broken = {
      ...validModule,
      subscriptions: [
        {
          event: contract,
          serializeBy: (payload: { id: string }) => payload.id,
          handler: async () => {},
        },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Durable subscription to "fixture.record.created" needs a name'
    );
  });

  it("rejects duplicate subscription names within one module", () => {
    const contract = {
      name: "fixture.record.created",
      version: 1,
      payload: z.object({ id: z.string() }),
    };

    const broken = {
      ...validModule,
      subscriptions: [
        {
          event: contract,
          name: "record-created",
          durable: true,
          handler: async () => {},
        },
        {
          event: contract,
          name: "record-created",
          serializeBy: (payload: { id: string }) => payload.id,
          handler: async () => {},
        },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Subscription name "record-created" is declared more than once'
    );
  });

  it.each(["fifo.archive", "Archive", "archive now", "archive.dead-letter"])(
    "rejects the subscription name %j, which is not kebab-case",
    (name) => {
      const broken = {
        ...validModule,
        subscriptions: [
          {
            event: {
              name: "fixture.record.created",
              version: 1,
              payload: z.object({ id: z.string() }),
            },
            name,
            durable: true,
            handler: async () => {},
          },
        ],
      };

      expect(validateModule(broken)).toContain(
        `Subscription name "${name}" is not kebab-case.`
      );
    }
  );

  it("rejects an identifier that is not kebab-case", () => {
    const broken = {
      ...validModule,
      identity: { ...validModule.identity, id: "Fixture" },
    };

    expect(validateModule(broken).join(" ")).toContain("kebab-case");
  });

  it("rejects a key that does not start with the module id", () => {
    const broken = {
      ...validModule,
      permissions: [
        ...validModule.permissions,
        { key: "other:read" as const, label: "Other" },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain("other:read");
  });

  it("rejects a workspace entry without the use key", () => {
    const broken = {
      ...validModule,
      permissions: validModule.permissions.filter(
        (p) => p.key !== "fixture:use"
      ),
    };

    expect(validateModule(broken).join(" ")).toContain("fixture:use");
  });

  it("rejects an admin page without the admin key", () => {
    const broken = {
      ...validModule,
      permissions: validModule.permissions.filter(
        (p) => p.key !== "fixture:admin"
      ),
    };

    expect(validateModule(broken).join(" ")).toContain("fixture:admin");
  });

  it("rejects an admin entry that requires another module's admin key", () => {
    const broken = withForeignAdminPermission(validModule);

    expect(validateModule(broken).join(" ")).toContain(
      'Admin entry "fixture-admin" must require "fixture:admin"'
    );
  });

  it("rejects a pinned list of seven", () => {
    const entry = firstWorkspaceEntry(validModule.navigation.entries);

    const broken = {
      ...validModule,
      navigation: {
        ...validModule.navigation,
        pinned: Array.from({ length: 7 }, () => entry),
      },
    };

    expect(validateModule(broken).join(" ")).toContain("six");
  });

  it("accepts a pinned list of six", () => {
    const six = sixWorkspaceEntries(validModule.navigation.entries);

    const ok = {
      ...validModule,
      navigation: { pinned: six, entries: six },
      pages: {
        ...validModule.pages,
        workspace: six.map((entry) =>
          definePage({
            path: entry.path,
            permission: entry.requiredPermission,
            component: Empty,
          })
        ),
      },
    };

    expect(validateModule(ok)).toEqual([]);
  });

  it("rejects a pinned entry the module never declared", () => {
    const entry = firstWorkspaceEntry(validModule.navigation.entries);

    const broken = {
      ...validModule,
      navigation: {
        ...validModule.navigation,
        pinned: [...validModule.navigation.pinned, { ...entry, id: "ghost" }],
      },
    };

    expect(validateModule(broken).join(" ")).toContain('"ghost"');
  });

  it("rejects a pinned entry whose id matches a declared entry of another shape", () => {
    const entry = firstWorkspaceEntry(validModule.navigation.entries);

    const broken = {
      ...validModule,
      navigation: {
        ...validModule.navigation,
        pinned: [{ ...entry, path: "/somewhere-else" }],
      },
    };

    expect(validateModule(broken).join(" ")).toContain(entry.id);
  });

  it("rejects the same entry pinned twice", () => {
    const entry = firstWorkspaceEntry(validModule.navigation.entries);

    const broken = {
      ...validModule,
      navigation: { ...validModule.navigation, pinned: [entry, entry] },
    };

    expect(validateModule(broken).join(" ")).toContain("twice");
  });

  it("rejects a module with a workspace entry and no default user role (DEC-50)", () => {
    const broken = { ...validModule, defaultRoles: [] };

    expect(validateModule(broken).join(" ")).toContain('"Fixture user"');
  });

  it("rejects a default user role that does not carry the use key (DEC-50)", () => {
    const broken = {
      ...validModule,
      defaultRoles: [
        { name: "Fixture user", permissions: ["fixture:read" as const] },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain("fixture:use");
  });

  it("asks for no default user role when the module has no workspace entry", () => {
    const adminOnly = validModule.navigation.entries.filter(
      (entry) => entry.surface === "admin"
    );

    const ok = {
      ...validModule,
      defaultRoles: [],
      navigation: { pinned: adminOnly, entries: adminOnly },
    };

    expect(validateModule(ok)).toEqual([]);
  });

  it("rejects a sixth configuration field kind", () => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z.object({ when: z.date() }),
      },
    };

    expect(validateModule(broken).join(" ")).toContain("field kind");
  });

  it("accepts a labeled enum: a union of titled string literals (U-4)", () => {
    const ok = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z.object({
          mode: z
            .union([
              z.literal("basic").meta({ title: "Basic" }),
              z.literal("advanced").meta({ title: "Advanced" }),
            ])
            .default("basic"),
        }),
        fields: { mode: { id: "mode", title: "Mode" } },
      },
    };

    expect(validateModule(ok)).toEqual([]);
  });

  it("rejects a union that is not only string literals", () => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z.object({ mode: z.union([z.literal("a"), z.number()]) }),
        fields: { mode: { id: "mode", title: "Mode" } },
      },
    };

    expect(validateModule(broken).join(" ")).toContain("field kind");
  });

  // admin M-2: a rule the browser form cannot check would let the form allow a value the server refuses.
  it.each([
    ["a format", z.url()],
    ["an exclusive bound", z.number().positive()],
    ["a minimum list length", z.array(z.string()).min(1)],
    ["an entry minimum length", z.array(z.string().min(2))],
    ["a refinement", z.string().refine((value) => value !== "x")],
    [
      "an entry refinement",
      z.array(z.string().refine((value) => value !== "x")),
    ],
    ["a pattern flag", z.string().regex(/^[a-z]+$/i)],
    ["an untitled choice", z.union([z.literal("a"), z.literal("b")])],
  ])("rejects a field rule ConfigForm cannot check: %s", (_name, field) => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z.object({ value: field }),
        fields: { value: { id: "value", title: "Value" } },
      },
    };

    expect(validateModule(broken).join(" ")).toContain(
      'Field "value" uses a rule ConfigForm cannot check'
    );
  });

  it("rejects a refinement on the whole configuration", () => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z
          .object({ value: z.string() })
          .refine((values) => values.value !== "x"),
        fields: { value: { id: "value", title: "Value" } },
      },
    };

    expect(validateModule(broken).join(" ")).toContain("refinement");
  });

  it("accepts a field annotated with a title and a description", () => {
    const ok = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z.object({
          value: z
            .string()
            .max(10)
            .meta({ title: "Value", description: "Help" }),
        }),
        fields: { value: { id: "value", title: "Value" } },
      },
    };

    expect(validateModule(ok)).toEqual([]);
  });

  it("rejects a forbidden kind hidden under a default wrapper", () => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z.object({ when: z.date().default(new Date()) }),
      },
    };

    expect(validateModule(broken).join(" ")).toContain("field kind");
  });

  it("accepts a record resolver that returns no path", () => {
    const ok = {
      ...validModule,
      recordTypes: [
        {
          type: "fixture-record",
          resolve: () => Promise.resolve({ label: "One" }),
        },
      ],
    };

    expect(validateModule(ok)).toEqual([]);
  });

  it("accepts an omitted category provider and an omitted configuration", () => {
    const {
      categoryAssignment: _dropped,
      configuration: _omitted,
      ...rest
    } = validModule;

    expect(validateModule(rest)).toEqual([]);
  });

  it("rejects a settings section whose additional permission is not a module key", () => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        section: {
          ...validModule.configuration.section,
          // SAFETY: the rule under test is exactly that a non-key string is
          // rejected here; `never` feeds the field a value outside PermissionKey.
          additionalPermission: "nope" as never,
        },
      },
    };

    expect(validateModule(broken).join(" ")).toContain("additional permission");
  });

  it("rejects a workspace entry that requires a foreign permission", () => {
    const broken = {
      ...validModule,
      navigation: {
        ...validModule.navigation,
        entries: validModule.navigation.entries.map((e): NavigationEntry =>
          e.surface === "workspace"
            ? { ...e, requiredPermission: "fixture:admin" }
            : e
        ),
      },
    };

    expect(validateModule(broken).join(" ")).toContain("fixture-home");
  });

  it.each([
    [
      "a workspace page outside the module's paths",
      { workspace: [page("/elsewhere")] },
      'Page "/elsewhere" is outside the module\'s own paths: "/fixture", "/m/fixture", "/admin/fixture" or "/admin/m/fixture".',
    ],
    [
      "a workspace page that only shares the id's letters",
      { workspace: [page("/fixtures")] },
      'Page "/fixtures" is outside the module\'s own paths: "/fixture", "/m/fixture", "/admin/fixture" or "/admin/m/fixture".',
    ],
    [
      "an admin page on a workspace path",
      { admin: [page("/fixture/settings", "fixture:admin")] },
      'Page "/fixture/settings" is outside the module\'s own paths: "/fixture", "/m/fixture", "/admin/fixture" or "/admin/m/fixture".',
    ],
    [
      "an upper-case segment",
      { workspace: [page("/fixture/Lines")] },
      'Page path "/fixture/Lines" must be "/"-separated kebab-case words or ":name" parameters, each name once.',
    ],
    [
      "an empty segment",
      { workspace: [page("/fixture//lines")] },
      'Page path "/fixture//lines" must be "/"-separated kebab-case words or ":name" parameters, each name once.',
    ],
    [
      "a repeated parameter name",
      { workspace: [page("/fixture/:id/lines/:id")] },
      'Page path "/fixture/:id/lines/:id" must be "/"-separated kebab-case words or ":name" parameters, each name once.',
    ],
    [
      "a key the module does not declare",
      { workspace: [page("/fixture/other", "other:use")] },
      'Page "/fixture/other" requires "other:use", which the module does not declare.',
    ],
    [
      "an unknown record type",
      { workspace: [recordPage({ type: "nope", param: "id" })] },
      'Page "/fixture/:id" names record type "nope", which is not one of the module\'s record types.',
    ],
    [
      "a record read key the module does not declare",
      {
        workspace: [
          recordPage({
            type: "fixture_record",
            param: "id",
            read: "other:read",
          }),
        ],
      },
      'Page "/fixture/:id" reads its record with "other:read", which the module does not declare.',
    ],
    [
      "a record parameter its path lacks",
      { workspace: [recordPage({ type: "fixture_record", param: "key" })] },
      'Page "/fixture/:id" names record parameter "key", which its path does not hold.',
    ],
    [
      "two pages of one surface with the same shape",
      { workspace: [page("/fixture/:id"), page("/fixture/:key")] },
      'Pages "/fixture/:id" and "/fixture/:key" of the workspace surface match the same paths.',
    ],
    [
      "a parent that is a navigation entry of the other surface",
      { workspace: [childPage("/admin/fixture")] },
      'Page "/fixture/:id" names parent "/admin/fixture", which is not the path of one of its workspace navigation entries.',
    ],
  ] as const)(
    "refuses a page that breaks a page rule: %s",
    (_rule, extra, problem) => {
      const broken = {
        ...validModule,
        pages: {
          workspace: [
            ...validModule.pages.workspace,
            ...("workspace" in extra ? extra.workspace : []),
          ],
          admin: [
            ...validModule.pages.admin,
            ...("admin" in extra ? extra.admin : []),
          ],
        },
      };

      expect(validateModule(broken)).toEqual([problem]);
    }
  );

  it.each([
    ["a missing page", [page("/fixture")]],
    [
      "a page under another key",
      [page("/fixture"), page("/fixture/archive", "fixture:read")],
    ],
  ])("refuses a navigation entry without its page: %s", (_rule, workspace) => {
    const broken = {
      ...validModule,
      pages: { ...validModule.pages, workspace },
    };

    expect(validateModule(broken)).toEqual([
      'Navigation entry "fixture-archive" has no workspace page at "/fixture/archive" that requires "fixture:use".',
    ]);
  });

  it("refuses a navigation entry's page that names itself as its parent", () => {
    const broken = {
      ...validModule,
      pages: {
        ...validModule.pages,
        workspace: validModule.pages.workspace.map((entry) =>
          entry.path === "/fixture/archive"
            ? { ...entry, parent: entry.path }
            : entry
        ),
      },
    };

    expect(validateModule(broken)).toEqual([
      'Page "/fixture/archive" names parent "/fixture/archive", which is not the path of one of its workspace navigation entries.',
    ]);
  });

  it("rejects the landing flag on an admin entry", () => {
    expect(validateModule(withAdminLanding(validModule)).join(" ")).toContain(
      'Admin entry "fixture-admin"'
    );
  });

  it("rejects a default role granting a permission the module does not declare", () => {
    const broken = {
      ...validModule,
      defaultRoles: [
        { name: "Fixture user", permissions: ["other:read" as const] },
      ],
    };

    expect(validateModule(broken).join(" ")).toContain("other:read");
  });

  it("rejects two landing flags within one module", () => {
    const broken = {
      ...validModule,
      navigation: {
        ...validModule.navigation,
        entries: validModule.navigation.entries.map((e, index) =>
          index < 2 ? { ...e, landing: true } : e
        ),
      },
    };

    expect(validateModule(broken).join(" ")).toContain("landing");
  });

  it("refuses a dataset declaration that breaks a contract rule", () => {
    const validDataset: DatasetDeclaration = {
      name: "fixture.records",
      description: "The fixture's records.",
      permission: "fixture:read",
      fields: {
        id: { kind: "dimension", type: "text", description: "The record id." },
        label: { kind: "dimension", type: "text", description: "The label." },
        recordedOn: {
          kind: "dimension",
          type: "date",
          description: "The day the record was written.",
        },
        amountCents: {
          kind: "measure",
          type: "money",
          description: "The amount in cents.",
        },
        currency: {
          kind: "dimension",
          type: "text",
          description: "The currency.",
        },
      },
      timeField: "recordedOn",
      recordKey: { type: "fixture_record", field: "id" },
      currencyField: "currency",
      source: async () => {
        throw new Error("validateModule does not call a dataset source");
      },
    };

    expect(validateModule(withDatasets([validDataset]))).toEqual([]);

    const { currencyField: _omitted, ...withoutCurrency } = validDataset;

    const cases: readonly [readonly DatasetDeclaration[], string][] = [
      [
        [{ ...validDataset, name: "records" }],
        'Dataset name "records" must start with "fixture.".',
      ],
      [
        [{ ...validDataset, permission: "fixture:missing" }],
        'Dataset "fixture.records" names permission "fixture:missing", which the module does not declare.',
      ],
      [
        [{ ...validDataset, timeField: "label" }],
        'Dataset "fixture.records" names time field "label", which is not a declared date field.',
      ],
      [
        [
          {
            ...validDataset,
            recordKey: { type: "placeholder-record", field: "id" },
          },
        ],
        'Dataset "fixture.records" names record type "placeholder-record", which is not one of the module\'s record types.',
      ],
      [
        [
          {
            ...validDataset,
            recordKey: { type: "fixture_record", field: "amountCents" },
          },
        ],
        'Dataset "fixture.records" names record key field "amountCents", which is not a declared text field.',
      ],
      [
        [withoutCurrency],
        'Dataset "fixture.records" holds a money field, so it must name a declared text currency field.',
      ],
      [
        [validDataset, validDataset],
        'Dataset name "fixture.records" is declared more than once.',
      ],
    ];

    for (const [datasets, problem] of cases) {
      expect(validateModule(withDatasets(datasets))).toContain(problem);
    }
  });

  it("refuses an agent tool or an inbox the platform cannot use", () => {
    const longest = `fixture-${"a".repeat(56)}`;

    expect(
      validateModule(withTools(["fixture-count-records", longest]))
    ).toEqual([]);

    expect(validateModule(withInbox({ permission: "fixture:use" }))).toEqual(
      []
    );

    const cases: readonly [Module, string][] = [
      [
        withTools(["placeholder.count"]),
        'Agent tool "placeholder.count" is not kebab-case: lower-case letters and digits in hyphen-separated parts.',
      ],
      [
        withTools(["count-records"]),
        'Agent tool "count-records" must start with "fixture-".',
      ],
      [
        withTools(["fixture-count", "fixture-count"]),
        'Agent tool "fixture-count" is declared more than once.',
      ],
      [
        withTools(["list-datasets"]),
        'Agent tool "list-datasets" takes the name of a core tool.',
      ],
      [
        withTools([`${longest}a`]),
        `Agent tool "${longest}a" is longer than 64 characters.`,
      ],
      [
        withTools(["fixture-count"], " "),
        'Agent tool "fixture-count" has no description.',
      ],
      [
        withInbox({ permission: "other:read" }),
        'Document inbox "Fixture inbox" names permission "other:read", which the module does not declare.',
      ],
      [
        withInbox({ path: "https://example.com" }),
        'Document inbox "Fixture inbox" links to "https://example.com", which is not a path of the application.',
      ],
      [
        withInbox({ path: "//example.com" }),
        'Document inbox "Fixture inbox" links to "//example.com", which is not a path of the application.',
      ],
    ];

    for (const [module, problem] of cases) {
      expect(validateModule(module)).toEqual([problem]);
    }
  });
});

describe("validateRegistry", () => {
  it("accepts the exact ledger name for a module id", () => {
    expect(validateRegistry([validModule])).toEqual([]);
  });

  it("accepts a module ledger named after a hyphenated module id", () => {
    const contractData = {
      ...renameModule(validModule, "contract-data"),
      schema: {
        ...validModule.schema,
        migrationsTable: "__drizzle_migrations_contract_data",
      },
    };

    expect(validateRegistry([contractData])).toEqual([]);
  });

  it("rejects a module ledger with a name unrelated to its module id", () => {
    const broken = {
      ...validModule,
      schema: {
        ...validModule.schema,
        migrationsTable: "__drizzle_migrations_other",
      },
    };

    const problems = validateRegistry([broken]).join(" ");

    expect(problems).toContain("fixture");
    expect(problems).toContain("__drizzle_migrations_fixture");
  });

  it("accepts one landing flag across two modules", () => {
    const landing = withLanding(validModule);
    const plain = renameModule(validModule, "second");

    expect(validateRegistry([landing, plain])).toEqual([]);
  });

  it("accepts zero landing flags", () => {
    expect(
      validateRegistry([validModule, renameModule(validModule, "second")])
    ).toEqual([]);
  });

  it("rejects two landing flags across two modules", () => {
    const first = withLanding(validModule);
    const second = withLanding(renameModule(validModule, "second"));

    expect(validateRegistry([first, second]).join(" ")).toContain("landing");
  });

  it("rejects one agent tool name from two modules whose ids share a prefix", () => {
    const tool = ["contract-data-count"];

    expect(
      validateRegistry([
        renameModule(withTools(tool), "contract"),
        renameModule(withTools(tool), "contract-data"),
      ])
    ).toEqual([
      'Agent tool "contract-data-count" is provided by modules "contract" and "contract-data".',
    ]);
  });

  it("rejects two modules with the same id", () => {
    expect(validateRegistry([validModule, validModule]).join(" ")).toContain(
      "fixture"
    );
  });
});

const Empty = () => null;

/** One page that loads nothing, for the page rules. */
function page(
  path: string,
  permission: `${string}:${string}` = "fixture:use"
): ModulePage {
  return definePage({ path, permission, component: Empty });
}

/** One `/fixture/:id` page whose check runs on the given record. */
function recordPage(record: NonNullable<ModulePage["record"]>): ModulePage {
  return definePage({
    path: "/fixture/:id",
    permission: "fixture:use",
    record,
    component: Empty,
  });
}

/** One `/fixture/:id` page under the given parent. */
function childPage(parent: string): ModulePage {
  return definePage({
    path: "/fixture/:id",
    permission: "fixture:use",
    parent,
    component: Empty,
  });
}

/** The valid fixture providing one read tool of each given name. */
function withTools(names: readonly string[], description = "Counts records.") {
  const tools = names.map((name) =>
    defineAgentTool({
      name,
      description,
      input: z.object({}),
      run: async () => ({ output: 0, rowCount: 0 }),
    })
  );

  return {
    ...validModule,
    capabilities: [capability("agent-tools", { tools })],
  };
}

/** The valid fixture providing an inbox at its home page, with the given changes. */
function withInbox(change: Partial<DocumentInbox>) {
  const inbox: DocumentInbox = {
    label: "Fixture inbox",
    path: "/fixture",
    permission: "fixture:use",
    ...change,
  };

  return {
    ...validModule,
    capabilities: [capability("document-inbox", inbox)],
  };
}

/** The valid fixture with the given dataset declarations. */
function withDatasets(datasets: readonly DatasetDeclaration[]) {
  return { ...validModule, datasets };
}

/**
 * `noUncheckedIndexedAccess` types `entries[0]` as possibly undefined; the plan's
 * verbatim `entries[0]` would rely on fixture shape the type cannot prove. This
 * picks a workspace entry explicitly, because only those can fill a six-slot
 * pinned list without the per-entry required-permission rule firing.
 */
function firstWorkspaceEntry(
  entries: readonly NavigationEntry[]
): NavigationEntry {
  const entry = entries.find((e) => e.surface === "workspace");

  if (entry === undefined) throw new Error("fixture lost its workspace entry");

  return entry;
}

/**
 * Six distinct workspace entries. The pinned rail draws from the declared
 * entries and holds each of them once, so a six-slot case needs six of them
 * rather than one entry repeated.
 */
function sixWorkspaceEntries(
  entries: readonly NavigationEntry[]
): readonly NavigationEntry[] {
  const entry = firstWorkspaceEntry(entries);

  return Array.from({ length: 6 }, (_unused, index) => ({
    ...entry,
    id: `${entry.id}-${index}`,
    path: `${entry.path}/${index}`,
  }));
}

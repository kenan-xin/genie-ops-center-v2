import { initTRPC } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createModuleTRPC } from "../entitlement/module-trpc.ts";
import {
  renameModule,
  withAdminLanding,
  withForeignAdminPermission,
  withLanding,
} from "./__fixtures__/invalid-modules.ts";
import { validModule } from "./__fixtures__/valid-module.ts";
import type { NavigationEntry } from "./module.ts";
import { validateModule, validateRegistry } from "./validate.ts";

describe("validateModule", () => {
  it("accepts the valid fixture", () => {
    expect(validateModule(validModule)).toEqual([]);
  });

  it("reserves the module id core", () => {
    expect(validateModule(renameModule(validModule, "core"))).toContain(
      'Module id "core" is reserved for core.'
    );
  });

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

  it("rejects a router that createModuleTRPC did not build", () => {
    const broken = { ...validModule, router: initTRPC.create().router({}) };

    expect(validateModule(broken)).toEqual([
      'Module "fixture" has a router not built by createModuleTRPC("fixture").',
    ]);
  });

  it("rejects a router built by createModuleTRPC for another module id", () => {
    const broken = {
      ...validModule,
      router: createModuleTRPC("placeholder").router({}),
    };

    expect(validateModule(broken)).toEqual([
      'Module "fixture" has a router built by createModuleTRPC("placeholder"). It must use "fixture".',
    ]);
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

    expect(validateModule(broken)).not.toEqual([]);
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

  it("accepts an admin entry that requires its own admin key", () => {
    const admin = validModule.navigation.entries.find(
      (entry) => entry.surface === "admin"
    );

    expect(admin?.requiredPermission).toBe("fixture:admin");
    expect(validateModule(validModule)).toEqual([]);
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

  it("accepts all five configuration field kinds", () => {
    expect(validateModule(validModule)).toEqual([]);
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

  it("rejects two modules with the same id", () => {
    expect(validateRegistry([validModule, validModule]).join(" ")).toContain(
      "fixture"
    );
  });
});

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

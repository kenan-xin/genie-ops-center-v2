import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  renameModule,
  withAdminLanding,
  withLanding,
} from "./__fixtures__/invalid-modules.ts";
import { validModule } from "./__fixtures__/valid-module.ts";
import type { NavigationEntry } from "./module.ts";
import { validateModule, validateRegistry } from "./validate.ts";

describe("validateModule", () => {
  it("accepts the valid fixture", () => {
    expect(validateModule(validModule)).toEqual([]);
  });

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
    const entry = firstWorkspaceEntry(validModule.navigation.entries);

    const ok = {
      ...validModule,
      navigation: {
        ...validModule.navigation,
        pinned: Array.from({ length: 6 }, () => entry),
      },
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

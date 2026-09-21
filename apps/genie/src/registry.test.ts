import { type Module, type PermissionKey, validateRegistry } from "@genie/core";
import { placeholderModule } from "@genie/module-placeholder";
import { describe, expect, it } from "vitest";

import { assertRegistryIsValid, assertSelectedIdentity } from "./registry.ts";

/**
 * Fixtures derive from the real declaration rather than a hand-built object cast
 * to `never`. A cast would hide the drift these checks exist to catch: if the
 * contract gains a required field, or the validator starts reading one, a cast
 * fixture keeps passing while a derived one stops compiling.
 */
function moduleWithLanding(id: string, landing: boolean): Module {
  // SAFETY: the id comes from this file and is kebab-case, so `<id>:use` is a
  // permission key by construction. `isPermissionKey` would accept it.
  const usePermission = `${id}:use` as PermissionKey;

  const base = {
    id: `${id}-home`,
    label: id,
    path: `/${id}`,
    surface: "workspace",
    requiredPermission: usePermission,
  } as const;

  const entry = landing ? { ...base, landing: true } : base;

  const permissions = placeholderModule.permissions.map((permission) => {
    // SAFETY: the placeholder's keys are `placeholder:<action>`, so replacing
    // that one prefix with another kebab-case id yields `<id>:<action>`.
    const key = permission.key.replace(
      /^placeholder:/,
      `${id}:`
    ) as PermissionKey;

    return { key, label: permission.label };
  });

  return {
    ...placeholderModule,
    identity: { ...placeholderModule.identity, id, displayName: id },
    permissions,
    defaultRoles: [{ name: `${id} user`, permissions: [usePermission] }],
    navigation: { pinned: [], entries: [entry] },
  };
}

describe("the landing-route rule over a two-module fixture (R-23a)", () => {
  it("core reports two landing routes across the registry", () => {
    const problems = validateRegistry([
      moduleWithLanding("alpha", true),
      moduleWithLanding("beta", true),
    ]);

    expect(problems.some((problem) => /landing route/i.test(problem))).toBe(
      true
    );
  });

  it("core reports nothing about landing routes for exactly one", () => {
    const problems = validateRegistry([
      moduleWithLanding("alpha", true),
      moduleWithLanding("beta", false),
    ]);

    expect(problems.some((problem) => /landing route/i.test(problem))).toBe(
      false
    );
  });
});

describe("assertRegistryIsValid", () => {
  it("throws and names every problem the validator returned", () => {
    expect(() =>
      assertRegistryIsValid([
        moduleWithLanding("alpha", true),
        moduleWithLanding("beta", true),
      ])
    ).toThrow(/landing route/i);
  });

  it("accepts a registry the validator reported no problem for", () => {
    expect(() => assertRegistryIsValid([])).not.toThrow();
  });
});

describe("assertSelectedIdentity", () => {
  it("rejects a declaration whose id does not match its selected metadata", () => {
    expect(() =>
      assertSelectedIdentity([moduleWithLanding("alpha", false)], ["beta"])
    ).toThrow(/alpha/);
  });

  it("rejects a selection that is missing a declaration", () => {
    expect(() =>
      assertSelectedIdentity(
        [moduleWithLanding("alpha", false)],
        ["alpha", "beta"]
      )
    ).toThrow(/beta/);
  });

  it("accepts a matching selection in the same order", () => {
    expect(() =>
      assertSelectedIdentity([moduleWithLanding("alpha", false)], ["alpha"])
    ).not.toThrow();
  });

  it("rejects the right ids in the wrong order, because order drives migrations", () => {
    expect(() =>
      assertSelectedIdentity(
        [moduleWithLanding("alpha", false), moduleWithLanding("beta", false)],
        ["beta", "alpha"]
      )
    ).toThrow(/order/i);
  });
});

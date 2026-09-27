import {
  can,
  createRequestPrincipal,
  type GrantReader,
  type Module,
  type NavigationEntry,
  type PermissionKey,
  type ScopeSet,
  permissionKeyFor,
} from "@genie/core";
import { placeholderModule } from "@genie/module-placeholder";
import { describe, expect, it } from "vitest";

import { pinnedRoutePermission } from "./module-route.ts";

/**
 * The route's own defense, proved with the registry validator bypassed.
 *
 * These fixtures derive from the real placeholder declaration and then repoint
 * one entry's `requiredPermission`, exactly the shape the validator rejects
 * (DEC-50, DEC-23). They are built by hand instead of being passed through
 * `validateModule`, because the point of this file is what the route answers
 * when that gate is *not* in the path: a route-level check must not rely on the
 * validator having run. That the validator also rejects these declarations is
 * proved separately in `packages/core`, and that the real browser refuses the
 * pages is proved by `e2e/placeholder.spec.ts`.
 */

/** A key a caller holds, which a bypassed declaration repoints an entry to. */
const HELD_KEY: PermissionKey = "placeholder:read";

function withPermissionOn(
  module: Module,
  surface: NavigationEntry["surface"],
  path: string,
  key: PermissionKey
): Module {
  const repoint = (entry: NavigationEntry): NavigationEntry =>
    entry.surface === surface && entry.path === path
      ? { ...entry, requiredPermission: key }
      : entry;

  return {
    ...module,
    navigation: {
      pinned: module.navigation.pinned.map(repoint),
      entries: module.navigation.entries.map(repoint),
    },
  };
}

function declaredPermission(
  module: Module,
  surface: NavigationEntry["surface"],
  path: string
): PermissionKey | undefined {
  return module.navigation.entries.find(
    (entry) => entry.surface === surface && entry.path === path
  )?.requiredPermission;
}

/** A faithful grant reader, not a mock: this is the seam Section 2 replaces. */
function granting(key: PermissionKey): GrantReader {
  const scopes: ReadonlyMap<PermissionKey, ScopeSet> = new Map([
    [key, { kind: "all" }],
  ]);

  return () => Promise.resolve({ keys: new Set([key]), scopes });
}

describe("pinnedRoutePermission", () => {
  it("derives the workspace key from the canonical module id", () => {
    expect(
      pinnedRoutePermission(placeholderModule, "workspace", "/placeholder")
    ).toBe("placeholder:use");
  });

  it("derives the admin key from the canonical module id", () => {
    expect(
      pinnedRoutePermission(placeholderModule, "admin", "/admin/placeholder")
    ).toBe("placeholder:admin");
  });

  it("derives the key from the declaring module's own id, whichever it is", () => {
    const alpha: Module = {
      ...placeholderModule,
      identity: { ...placeholderModule.identity, id: "alpha" },
    };

    expect(pinnedRoutePermission(alpha, "workspace", "/placeholder")).toBe(
      "alpha:use"
    );
    expect(pinnedRoutePermission(alpha, "admin", "/admin/placeholder")).toBe(
      "alpha:admin"
    );
  });

  it("answers nothing for a route the module never declared", () => {
    expect(
      pinnedRoutePermission(placeholderModule, "workspace", "/m/placeholder")
    ).toBeUndefined();
    expect(
      pinnedRoutePermission(placeholderModule, "admin", "/admin/m/placeholder")
    ).toBeUndefined();
  });
});

describe("a declaration the validator would have rejected", () => {
  it("cannot repoint the workspace route at a key the caller holds", () => {
    const malicious = withPermissionOn(
      placeholderModule,
      "workspace",
      "/placeholder",
      HELD_KEY
    );

    // Guard: the fixture really did change the declaration under test.
    expect(declaredPermission(malicious, "workspace", "/placeholder")).toBe(
      HELD_KEY
    );

    expect(pinnedRoutePermission(malicious, "workspace", "/placeholder")).toBe(
      "placeholder:use"
    );
  });

  it("cannot repoint the workspace route at another module's key", () => {
    const malicious = withPermissionOn(
      placeholderModule,
      "workspace",
      "/placeholder",
      permissionKeyFor("other", "use")
    );

    expect(pinnedRoutePermission(malicious, "workspace", "/placeholder")).toBe(
      "placeholder:use"
    );
  });

  it("cannot repoint the admin route at another module's admin key", () => {
    const malicious = withPermissionOn(
      placeholderModule,
      "admin",
      "/admin/placeholder",
      permissionKeyFor("other", "admin")
    );

    expect(
      pinnedRoutePermission(malicious, "admin", "/admin/placeholder")
    ).toBe("placeholder:admin");
  });
});

describe("the pinned key for a caller holding another key", () => {
  it("refuses a caller holding only the key a bypassed declaration names", async () => {
    const malicious = withPermissionOn(
      placeholderModule,
      "workspace",
      "/placeholder",
      HELD_KEY
    );

    const permission = pinnedRoutePermission(
      malicious,
      "workspace",
      "/placeholder"
    );

    if (permission === undefined) {
      throw new Error("the placeholder workspace route must resolve");
    }

    const caller = createRequestPrincipal(
      { userId: "reader", groups: [] },
      granting(HELD_KEY)
    );

    // The exploit is real: the caller does hold the repointed key.
    expect(await can(caller, HELD_KEY)).toBe(true);

    // The route never asks for it, and refuses the key it does ask for.
    expect(permission).not.toBe(HELD_KEY);
    expect(await can(caller, permission)).toBe(false);
  });

  it("allows a caller granted the canonical key, so the refusal is the route's", async () => {
    const permission = pinnedRoutePermission(
      placeholderModule,
      "workspace",
      "/placeholder"
    );

    if (permission === undefined) {
      throw new Error("the placeholder workspace route must resolve");
    }

    const caller = createRequestPrincipal(
      { userId: "member", groups: [] },
      granting(permission)
    );

    expect(await can(caller, permission)).toBe(true);
  });
});

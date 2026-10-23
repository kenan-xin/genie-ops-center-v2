import { describe, expect, it } from "vitest";

import { CORE_PERMISSION_KEYS } from "../../services/authorization/index.ts";
import { validModule } from "../module-contract/__fixtures__/valid-module.ts";
import type { Module, NavigationEntry } from "../module-contract/module.ts";
import { CORE_ADMIN_NAVIGATION } from "./core-admin.ts";
import { CORE_NAVIGATION_ID, type PermittedEntry } from "./index.ts";
import { buildNavigationTree } from "./tree.ts";

function entry(
  id: string,
  label: string,
  surface: NavigationEntry["surface"] = "workspace"
): NavigationEntry {
  return {
    id,
    label,
    path: `/${id}`,
    surface,
    requiredPermission: "fixture:use",
  };
}

/** A fixture module derived from `validModule`, with its own id and navigation. */
function moduleWith(
  id: string,
  entries: readonly NavigationEntry[],
  pinned: readonly NavigationEntry[] = []
): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id, displayName: id },
    navigation: { pinned, entries },
  };
}

/** Every declared entry of the given modules, as `permittedNavigation` would keep them. */
function permittedOf(modules: readonly Module[]): PermittedEntry[] {
  return modules.flatMap((module) =>
    module.navigation.entries.map((declared) => ({
      ...declared,
      moduleId: module.identity.id,
    }))
  );
}

/** A core admin entry as `permittedNavigation` keeps it. */
function core(id: string): PermittedEntry {
  const declared = CORE_ADMIN_NAVIGATION.flatMap((group) => group.entries).find(
    (candidate) => candidate.id === id
  );

  return { ...declared!, moduleId: CORE_NAVIGATION_ID };
}

const FINANCE = { id: "cat-finance", name: "Finance", position: 1 };

const OPERATIONS = { id: "cat-operations", name: "Operations", position: 2 };

const EMPTY = { id: "cat-empty", name: "Empty", position: 3 };

describe("buildNavigationTree", () => {
  it("puts the entries of a module with no category in the workspace block, in declared order", () => {
    const alpha = moduleWith("alpha", [
      entry("alpha-zed", "Zed"),
      entry("alpha-able", "Able"),
    ]);

    const permitted = permittedOf([alpha]);

    expect(
      buildNavigationTree({
        modules: [alpha],
        permitted,
        categories: [FINANCE],
        categoryOf: new Map([["alpha", null]]),
      })
    ).toEqual({
      pinned: [],
      workspace: [
        { ...entry("alpha-zed", "Zed"), moduleId: "alpha" },
        { ...entry("alpha-able", "Able"), moduleId: "alpha" },
      ],
      categories: [],
      admin: [],
      landing: undefined,
    });
  });

  it("groups entries under their module's category in category order, sorted by label, and omits an empty category", () => {
    const alpha = moduleWith("alpha", [entry("alpha-ledger", "Ledger")]);

    const beta = moduleWith("beta", [
      entry("beta-payroll", "Payroll"),
      entry("beta-invoices", "Invoices"),
    ]);

    const gamma = moduleWith("gamma", [entry("gamma-invoices", "Invoices")]);
    const modules = [alpha, beta, gamma];

    expect(
      buildNavigationTree({
        modules,
        permitted: permittedOf(modules),
        categories: [FINANCE, OPERATIONS, EMPTY],
        categoryOf: new Map([
          ["alpha", OPERATIONS.id],
          ["beta", FINANCE.id],
          ["gamma", FINANCE.id],
        ]),
      })
    ).toEqual({
      pinned: [],
      workspace: [],
      categories: [
        {
          id: FINANCE.id,
          name: "Finance",
          entries: [
            { ...entry("beta-invoices", "Invoices"), moduleId: "beta" },
            { ...entry("gamma-invoices", "Invoices"), moduleId: "gamma" },
            { ...entry("beta-payroll", "Payroll"), moduleId: "beta" },
          ],
        },
        {
          id: OPERATIONS.id,
          name: "Operations",
          entries: [{ ...entry("alpha-ledger", "Ledger"), moduleId: "alpha" }],
        },
      ],
      admin: [],
      landing: undefined,
    });
  });

  it("treats a placement that names no listed category as none", () => {
    const alpha = moduleWith("alpha", [entry("alpha-ledger", "Ledger")]);

    expect(
      buildNavigationTree({
        modules: [alpha],
        permitted: permittedOf([alpha]),
        categories: [FINANCE],
        categoryOf: new Map([["alpha", "cat-deleted"]]),
      })
    ).toEqual({
      pinned: [],
      workspace: [{ ...entry("alpha-ledger", "Ledger"), moduleId: "alpha" }],
      categories: [],
      admin: [],
      landing: undefined,
    });
  });

  it("keeps the landing route when its entry moves under a category", () => {
    const home = { ...entry("alpha-home", "Home"), landing: true };
    const alpha = moduleWith("alpha", [home]);

    expect(
      buildNavigationTree({
        modules: [alpha],
        permitted: permittedOf([alpha]),
        categories: [FINANCE],
        categoryOf: new Map([["alpha", FINANCE.id]]),
      })
    ).toEqual({
      pinned: [],
      workspace: [],
      categories: [
        {
          id: FINANCE.id,
          name: "Finance",
          entries: [{ ...home, moduleId: "alpha" }],
        },
      ],
      admin: [],
      landing: "/alpha-home",
    });
  });

  it("caps the pinned rail at six permitted workspace entries across modules and drops admin entries", () => {
    const alphaEntries = [
      entry("alpha-1", "A1"),
      entry("alpha-admin", "Alpha settings", "admin"),
      entry("alpha-2", "A2"),
      entry("alpha-3", "A3"),
    ];

    const betaEntries = [
      entry("beta-1", "B1"),
      entry("beta-2", "B2"),
      entry("beta-3", "B3"),
      entry("beta-4", "B4"),
    ];

    const alpha = moduleWith("alpha", alphaEntries, alphaEntries);
    const beta = moduleWith("beta", betaEntries, betaEntries);
    const modules = [alpha, beta];

    const tree = buildNavigationTree({
      modules,
      permitted: permittedOf(modules),
      categories: [],
      categoryOf: new Map(),
    });

    expect(tree.pinned).toEqual([
      { ...entry("alpha-1", "A1"), moduleId: "alpha" },
      { ...entry("alpha-2", "A2"), moduleId: "alpha" },
      { ...entry("alpha-3", "A3"), moduleId: "alpha" },
      { ...entry("beta-1", "B1"), moduleId: "beta" },
      { ...entry("beta-2", "B2"), moduleId: "beta" },
      { ...entry("beta-3", "B3"), moduleId: "beta" },
    ]);
  });

  it("groups admin entries: core groups first, then one group per module", () => {
    const fixtureAdmin = {
      ...validModule.navigation.entries.find(
        (candidate) => candidate.id === "fixture-admin"
      )!,
      moduleId: "fixture",
    };

    const tree = buildNavigationTree({
      modules: [validModule],
      permitted: [core("core-audit"), core("core-modules"), fixtureAdmin],
      categories: [],
      categoryOf: new Map(),
    });

    expect(tree).toEqual({
      pinned: [],
      workspace: [],
      categories: [],
      admin: [
        { id: "tenant", entries: [core("core-audit")] },
        { id: "catalog", entries: [core("core-modules")] },
        { id: "fixture", entries: [fixtureAdmin] },
      ],
      landing: undefined,
    });

    const declared = CORE_ADMIN_NAVIGATION.flatMap((group) => group.entries);

    expect(
      declared.every((admin) =>
        new Set<string>(CORE_PERMISSION_KEYS).has(admin.requiredPermission)
      )
    ).toBe(true);
    expect(new Set(declared.map((admin) => admin.id)).size).toBe(
      declared.length
    );
  });
});

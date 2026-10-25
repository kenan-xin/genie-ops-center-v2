import type { CategoryOption, ModuleRefusal, ModuleView } from "../types.ts";

export const FIXTURE_CATEGORIES: readonly CategoryOption[] = [
  { id: "c-ops", name: "Operations" },
  { id: "c-fin", name: "Finance" },
];

/** On, placed, and held by a person through two roles and by a group. */
export const FIXTURE_ON: ModuleView = {
  id: "fixture",
  displayName: "Fixture",
  enabled: true,
  categoryId: "c-ops",
  placeable: true,
  holders: [
    {
      principalType: "user",
      principalId: "p-1",
      label: "Ada Lovelace",
      roleName: "Fixture user",
    },
    {
      principalType: "user",
      principalId: "p-1",
      label: "Ada Lovelace",
      roleName: "Fixture approver",
    },
    {
      principalType: "group",
      principalId: "g-1",
      label: "Finance managers",
      roleName: "Fixture user",
    },
  ],
};

/** On, with no workspace entry and no holder. */
export const FIXTURE_UNPLACEABLE: ModuleView = {
  id: "exports",
  displayName: "Reporting exports",
  enabled: true,
  categoryId: null,
  placeable: false,
  holders: [],
};

/** Switched off, still held by a group (R-86). */
export const FIXTURE_OFF: ModuleView = {
  id: "dormant",
  displayName: "Dormant",
  enabled: false,
  categoryId: null,
  placeable: true,
  holders: [
    {
      principalType: "group",
      principalId: "g-2",
      label: "Night shift",
      roleName: "Dormant user",
    },
  ],
};

/** Off, waiting for a required configuration value (R-84a). */
export const FIXTURE_NEEDS_SETUP: ModuleView = {
  id: "setup",
  displayName: "Ticketing",
  enabled: false,
  categoryId: null,
  placeable: true,
  holders: [],
};

/** Held by fifteen principals, two of them groups: the Access cell names three (DR-26). */
export const FIXTURE_CROWDED: ModuleView = {
  id: "crowded",
  displayName: "Crowded",
  enabled: true,
  categoryId: "c-ops",
  placeable: true,
  holders: [
    ...Array.from({ length: 13 }, (_, index) => ({
      principalType: "user" as const,
      principalId: `p-${index + 10}`,
      label: `Person ${index + 1}`,
      roleName: "Crowded user",
    })),
    ...["Night shift", "Finance managers"].map((label, index) => ({
      principalType: "group" as const,
      principalId: `g-${index + 10}`,
      label,
      roleName: "Crowded user",
    })),
  ],
};

export const FIXTURE_MODULES: readonly ModuleView[] = [
  FIXTURE_ON,
  FIXTURE_UNPLACEABLE,
  FIXTURE_OFF,
  FIXTURE_NEEDS_SETUP,
];

export const FIXTURE_CONFIG_REFUSAL: ModuleRefusal = {
  moduleId: FIXTURE_NEEDS_SETUP.id,
  message: "The module configuration is not valid.",
  issues: [
    { path: "apiUrl", message: "Required" },
    { path: "queue.name", message: "Must be at least 3 characters" },
  ],
};

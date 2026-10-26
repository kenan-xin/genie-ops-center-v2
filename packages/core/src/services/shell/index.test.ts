import { describe, expect, it } from "vitest";

import { CORE_NAVIGATION_ID } from "../../lib/entitlement/index.ts";
import type { PermittedEntry } from "../../lib/entitlement/index.ts";
import type { NavigationTree } from "../../lib/entitlement/tree.ts";
import { validModule } from "../../lib/module-contract/__fixtures__/valid-module.ts";
import { createRequestPrincipal } from "../authorization/index.ts";
import type { BrandingImageSlot } from "../branding/schemas.ts";
import {
  administration,
  DEFAULT_FAVICON_URL,
  faviconHref,
  realmAccountUrl,
  realmResetCredentialsUrl,
  type ShellLabels,
  shellNavigation,
} from "./index.ts";

const core = (
  id: string,
  label: string,
  path: string,
  key: PermittedEntry["requiredPermission"]
): PermittedEntry => ({
  id,
  label,
  path,
  surface: "admin",
  requiredPermission: key,
  moduleId: CORE_NAVIGATION_ID,
});

const people = core(
  "core-people",
  "People",
  "/admin/people",
  "core:people:manage"
);

const audit = core(
  "core-audit",
  "Audit log",
  "/admin/audit",
  "core:audit:read"
);

const moduleEntry = (surface: "workspace" | "admin"): PermittedEntry => ({
  id: `fixture-${surface}`,
  label: `Fixture ${surface}`,
  path: `/fixture/${surface}`,
  surface,
  requiredPermission: "fixture:use",
  moduleId: "fixture",
  landing: true,
});

const tree = (admin: NavigationTree["admin"]): NavigationTree => ({
  pinned: [moduleEntry("workspace")],
  workspace: [moduleEntry("workspace")],
  categories: [
    { id: "c1", name: "Finance", entries: [moduleEntry("workspace")] },
  ],
  admin,
  landing: "/fixture/workspace",
});

const labels: ShellLabels = {
  coreEntries: { "core-people": "Catalogue people" },
  coreGroups: {
    "people-and-access": "Catalogue people and access",
    "tenant": "Catalogue tenant",
    "catalog": "Catalogue catalog",
  },
};

const full = tree([
  { id: "people-and-access", entries: [people] },
  { id: "tenant", entries: [audit] },
  { id: "fixture", entries: [moduleEntry("admin")] },
  { id: "gone", entries: [moduleEntry("admin")] },
]);

describe("shellNavigation", () => {
  it("drops every permission field", () => {
    const json = JSON.stringify(shellNavigation(full, [validModule], labels));

    expect(json).not.toContain("requiredPermission");
    expect(json).not.toContain("core:people:manage");
    expect(json).not.toContain("fixture:use");
    expect(json).not.toContain("moduleId");
    expect(json).not.toContain("landing");
  });

  it("takes catalogue labels for core entries and groups, and display names for module groups", () => {
    const result = shellNavigation(full, [validModule], labels);

    expect(result.admin).toEqual([
      {
        id: "people-and-access",
        label: "Catalogue people and access",
        entries: [
          {
            id: "core-people",
            label: "Catalogue people",
            href: "/admin/people",
          },
        ],
      },
      {
        id: "tenant",
        label: "Catalogue tenant",
        // No catalogue label: the declared one stays.
        entries: [
          { id: "core-audit", label: "Audit log", href: "/admin/audit" },
        ],
      },
      {
        id: "fixture",
        label: "Fixture",
        entries: [
          {
            id: "fixture-admin",
            label: "Fixture admin",
            href: "/fixture/admin",
          },
        ],
      },
      {
        id: "gone",
        label: "gone",
        entries: [
          {
            id: "fixture-admin",
            label: "Fixture admin",
            href: "/fixture/admin",
          },
        ],
      },
    ]);
    expect(result.categories).toEqual([
      {
        id: "c1",
        name: "Finance",
        entries: [
          {
            id: "fixture-workspace",
            label: "Fixture workspace",
            href: "/fixture/workspace",
          },
        ],
      },
    ]);
  });
});

describe("administration", () => {
  it("a module admin group alone is not an administrator", () => {
    expect(
      administration(tree([{ id: "fixture", entries: [moduleEntry("admin")] }]))
    ).toEqual({
      isAdministrator: false,
      adminHome: undefined,
    });
  });

  it("an auditor lands on the audit log", () => {
    expect(administration(tree([{ id: "tenant", entries: [audit] }]))).toEqual({
      isAdministrator: true,
      adminHome: "/admin/audit",
    });
  });

  it("People comes first when permitted", () => {
    expect(administration(full).adminHome).toBe("/admin/people");
  });
});

describe("realmAccountUrl", () => {
  const local = {
    localAccountsEnabled: true,
    realmSupportsLocalAccounts: true,
    keycloakUrlAtSetup: null,
  };

  it("uses the setup-time Keycloak URL of a local, supported realm", () => {
    expect(
      realmAccountUrl({
        settings: { ...local, keycloakUrlAtSetup: "https://id.example.com" },
        publicUrl: "https://ops.example.com",
        realm: "acme",
      })
    ).toBe("https://id.example.com/realms/acme/account");
  });

  it("falls back to the public URL and the genie realm", () => {
    expect(
      realmAccountUrl({
        settings: local,
        publicUrl: "https://ops.example.com",
        realm: undefined,
      })
    ).toBe("https://ops.example.com/realms/genie/account");
  });

  it("links the reset-credentials page of the same realm (Spec 2 R-51a)", () => {
    const input = {
      settings: { ...local, keycloakUrlAtSetup: "https://id.example.com" },
      publicUrl: "https://ops.example.com",
      realm: "acme",
    };

    expect(realmResetCredentialsUrl(input)).toBe(
      "https://id.example.com/realms/acme/login-actions/reset-credentials"
    );
    expect(
      realmResetCredentialsUrl({
        ...input,
        settings: { ...input.settings, realmSupportsLocalAccounts: false },
      })
    ).toBeNull();
  });

  it("gives null without local accounts", () => {
    expect(
      realmAccountUrl({
        settings: { ...local, localAccountsEnabled: false },
        publicUrl: "https://ops.example.com",
        realm: "acme",
      })
    ).toBeNull();
  });
});

/** A file store whose branding link knows only the given slots. */
const storage = (published: readonly BrandingImageSlot[]) => ({
  createBrandingMarkLink: async (input: {
    readonly slot?: BrandingImageSlot;
  }) =>
    input.slot !== undefined && published.includes(input.slot)
      ? {
          token: "t",
          url: `https://ops.example/api/files/download?token=${input.slot}`,
          expiresAt: new Date(),
        }
      : undefined,
});

describe("faviconHref", () => {
  const signedIn = createRequestPrincipal(
    { userId: "u1", groups: [], authenticated: true },
    () => Promise.resolve({ keys: new Set(), scopes: new Map() })
  );

  it("links the published favicon", async () => {
    await expect(
      faviconHref(storage(["favicon", "logoMark"]), signedIn)
    ).resolves.toBe("https://ops.example/api/files/download?token=favicon");
  });

  it("falls back to the Ops Center favicon when none is linked", async () => {
    await expect(faviconHref(storage(["logoMark"]), signedIn)).resolves.toBe(
      DEFAULT_FAVICON_URL
    );
  });
});

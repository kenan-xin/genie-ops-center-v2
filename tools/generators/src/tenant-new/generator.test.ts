import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, it } from "vitest";

import { tenantGenerator } from "./generator.ts";

const OPTIONS = {
  name: "demo-co",
  modules: ["placeholder"],
  onboardingMode: "invite",
  localAccounts: false,
  firstAdministrators: ["admin@example.com"],
  breakGlassEmail: "break-glass@example.com",
  companyName: "Demo Group",
  productName: "Demo Ops",
  defaultLocale: "en",
  defaultTimeZone: "Europe/Berlin",
} as const;

/**
 * An empty workspace already carries its own scaffolding, so every assertion below
 * reads the paths this generator added and not the ones the helper created.
 */
function emptyTree() {
  const tree = createTreeWithEmptyWorkspace();
  const before = new Set(tree.listChanges().map((change) => change.path));

  return {
    tree,
    added: () =>
      tree
        .listChanges()
        .map((change) => change.path)
        .filter((path) => !before.has(path))
        .toSorted(),
  };
}

describe("nx g @genie/generators:tenant-new", () => {
  it("writes the seven files under the customer's deploy folder", async () => {
    const { tree, added } = emptyTree();

    await tenantGenerator(tree, { ...OPTIONS });

    expect(added()).toEqual([
      "customers/demo-co/deploy/.env.example",
      "customers/demo-co/deploy/branding.seed.json",
      "customers/demo-co/deploy/compose.yaml",
      "customers/demo-co/deploy/modules.txt",
      "customers/demo-co/deploy/realm.overrides.json",
      "customers/demo-co/deploy/tenant.yaml",
      "customers/demo-co/deploy/values.yaml",
    ]);
  });

  // The generator validates against the strict schemas core owns, not a copy and
  // not a double, so a value core refuses fails the command (R-31, DEC-35).
  it("refuses an administrator address the core schema rejects", async () => {
    const { tree, added } = emptyTree();

    await expect(
      tenantGenerator(tree, {
        ...OPTIONS,
        firstAdministrators: ["not-an-email"],
      })
    ).rejects.toThrow(/tenant\.yaml/);

    expect(added()).toEqual([]);
  });

  it("refuses an empty administrator list, which core requires to hold one", async () => {
    const { tree } = emptyTree();

    await expect(
      tenantGenerator(tree, { ...OPTIONS, firstAdministrators: [] })
    ).rejects.toThrow(/tenant\.yaml/);
  });

  it("refuses an onboarding mode outside the documented set", async () => {
    const { tree } = emptyTree();

    await expect(
      // A value from outside the union is exactly what a command line supplies.
      tenantGenerator(tree, { ...OPTIONS, onboardingMode: "open" })
    ).rejects.toThrow(/tenant\.yaml/);
  });

  it("refuses a customer folder that already exists", async () => {
    const { tree } = emptyTree();

    tree.write("customers/demo-co/deploy/tenant.yaml", "modules: []\n");

    await expect(tenantGenerator(tree, { ...OPTIONS })).rejects.toThrow(
      /already exists/
    );
  });
});

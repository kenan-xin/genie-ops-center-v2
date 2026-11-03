import { describe, expect, it } from "vitest";

import { ADVANCED_CATALOGUE } from "./__fixtures__/access.ts";
import { advancedLinkAdd } from "./advanced-view.ts";

const linkAdd = (roleId: string | undefined, held: readonly string[] = []) =>
  advancedLinkAdd({
    catalogue: ADVANCED_CATALOGUE,
    held: new Set(held),
    roleId,
  });

describe("advancedLinkAdd", () => {
  it("W1: stages a core role link for the whole tenant, and nothing for a held, module or switched-off role", () => {
    const [, auditor] = ADVANCED_CATALOGUE.core;

    const [accessManager] = ADVANCED_CATALOGUE.custom;

    expect(linkAdd("r-auditor")).toEqual({
      option: auditor,
      scope: null,
      label: null,
    });
    expect(linkAdd("r-access-manager")).toEqual({
      option: accessManager,
      scope: null,
      label: null,
    });
    expect(linkAdd("r-auditor", ["r-auditor"])).toBeNull();
    expect(linkAdd("r-placeholder-user")).toBeNull();
    expect(linkAdd("r-invoice-approver")).toBeNull();
    expect(linkAdd("r-dashboard-curator")).toBeNull();
    expect(linkAdd(undefined)).toBeNull();
  });
});

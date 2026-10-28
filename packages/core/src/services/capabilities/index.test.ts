import { describe, expect, it } from "vitest";

import type { EntitlementReader } from "../../lib/tenant-context/readers.ts";
import { createCapabilityRegistry } from "./index.ts";

/** An entitlement reader that fails the test if it is read: `get` answers from memory (R-58). */
const entitlementsUnread: EntitlementReader = {
  isEnabled: () => Promise.reject(new Error("get read the entitlement")),
};

describe("the capability registry", () => {
  it("get answers the one provider, and refuses a name that two modules provide", async () => {
    const registry = createCapabilityRegistry(entitlementsUnread);
    const first = { tool: "one" };

    registry.provide("alpha", "tools", first);

    expect(registry.get("tools")).toBe(first);
    expect(registry.get("unprovided")).toBeUndefined();
    await expect(registry.list("unprovided")).resolves.toEqual([]);

    registry.provide("beta", "tools", { tool: "two" });

    expect(() => registry.get("tools")).toThrow(
      'Capability "tools" has 2 providers. Read them with list("tools").'
    );
  });

  it("refuses a second provision of one name by the same module", () => {
    const registry = createCapabilityRegistry(entitlementsUnread);

    registry.provide("alpha", "tools", { tool: "one" });

    expect(() => registry.provide("alpha", "tools", { tool: "two" })).toThrow(
      'Module "alpha" provides capability "tools" more than once.'
    );
  });
});

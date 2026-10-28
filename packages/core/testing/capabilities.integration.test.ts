import { describe, expect, it } from "vitest";

import type { CapabilityName } from "../contracts/index.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import type {
  CapabilityProvision,
  Module,
} from "../src/lib/module-contract/module.ts";
import { registerModuleRuntime } from "../src/lib/module-contract/runtime.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { enableModules, startDisposableDeployment } from "./index.ts";

/** The one implementation shape these fixtures provide. */
type ToolSet = { readonly tool: string };

/**
 * A module whose only changed point is one capability provision. It is a deviation from the
 * placeholder proof: no capability interface exists yet, so the fixture invents its own name.
 */
function moduleProviding(id: string, implementation: ToolSet): Module {
  // SAFETY: `CapabilityInterfaces` is empty until a real module needs one (R-13 deviation), so
  // the invented name is cast.
  const provision: CapabilityProvision = {
    name: "tools" as CapabilityName,
    implementation,
  };

  return {
    ...validModule,
    identity: { id, displayName: id, version: "0.0.0" },
    capabilities: [provision],
  };
}

describe("the capability registry against a real database", () => {
  it("list answers each enabled module's provider with its module id, in registration order", async () => {
    const deployment = await startDisposableDeployment();

    // Compiled with all three modules, so the entitlement reader answers for each (R-79).
    const context = createTenantContext(
      {
        DATABASE_URL: deployment.context.env.databaseUrl,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger(),
      ["alpha", "beta", "delta"]
    );

    try {
      // beta stays without a `tenant_module` row, so it reads as disabled (R-5).
      await enableModules(deployment.context, ["alpha", "delta"]);

      const alpha = { tool: "alpha" };
      const delta = { tool: "delta" };

      registerModuleRuntime(context, [
        moduleProviding("alpha", alpha),
        moduleProviding("beta", { tool: "beta" }),
        moduleProviding("delta", delta),
      ]);

      await expect(context.capabilities.list("tools")).resolves.toEqual([
        { moduleId: "alpha", implementation: alpha },
        { moduleId: "delta", implementation: delta },
      ]);
    } finally {
      await context.db.$client.end();
      await deployment.stop();
    }
  });
});

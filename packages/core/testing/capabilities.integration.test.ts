import { describe, expect, it } from "vitest";

import { capability, type DocumentInbox } from "../contracts/index.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { registerModuleRuntime } from "../src/lib/module-contract/runtime.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { enableModules, startDisposableDeployment } from "./index.ts";

/** The inbox a fixture module of the given id provides. */
function inboxOf(id: string): DocumentInbox {
  return { label: id, path: `/${id}`, permission: "fixture:use" };
}

/** A module whose only changed point is one `document-inbox` provision. */
function moduleProviding(id: string, implementation: DocumentInbox): Module {
  return {
    ...validModule,
    identity: { id, displayName: id, version: "0.0.0" },
    capabilities: [capability("document-inbox", implementation)],
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

      const alpha = inboxOf("alpha");
      const delta = inboxOf("delta");

      registerModuleRuntime(context, [
        moduleProviding("alpha", alpha),
        moduleProviding("beta", inboxOf("beta")),
        moduleProviding("delta", delta),
      ]);

      await expect(
        context.capabilities.list("document-inbox")
      ).resolves.toEqual([
        { moduleId: "alpha", implementation: alpha },
        { moduleId: "delta", implementation: delta },
      ]);
    } finally {
      await context.db.$client.end();
      await deployment.stop();
    }
  });
});

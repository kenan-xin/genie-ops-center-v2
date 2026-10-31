import { describe, expect, it } from "vitest";
import { z } from "zod";

import { capability, defineAgentTool } from "../contracts/index.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import type {
  Module,
  ModuleRequestContext,
} from "../src/lib/module-contract/module.ts";
import { registerModuleRuntime } from "../src/lib/module-contract/runtime.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { agentToolSet, offersWriteTool } from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
} from "./index.ts";

const run = async () => ({ output: 0, rowCount: 0 });

/** A module with one read tool for everyone and one write tool behind `fixture:write`. */
const fixtureModule: Module = {
  ...validModule,
  permissions: [
    ...validModule.permissions,
    { key: "fixture:write", label: "Change fixture records" },
  ],
  capabilities: [
    capability("agent-tools", {
      tools: [
        defineAgentTool({
          name: "fixture-read",
          description: "Reads a record.",
          input: z.strictObject({}),
          run,
        }),
        defineAgentTool({
          name: "fixture-change",
          description: "Changes a record.",
          input: z.strictObject({}),
          permission: "fixture:write",
          writes: true,
          run,
        }),
      ],
    }),
  ],
};

/** The tool names the model gets for this person, and whether one of them writes. */
const offered = async (ctx: ModuleRequestContext) => ({
  tools: Object.keys(await agentToolSet(ctx, { id: "session" })),
  writes: await offersWriteTool(ctx),
});

describe("the agent's module tools against a real database", () => {
  it("offers a keyed tool only to a holder, an unkeyed tool to everyone, and says when a write tool is offered", async () => {
    const deployment = await startDisposableDeployment();

    const tenant = createTenantContext(
      {
        DATABASE_URL: deployment.context.env.databaseUrl,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger(),
      ["fixture"]
    );

    try {
      await enableModules(deployment.context, ["fixture"]);
      registerModuleRuntime(tenant, [fixtureModule]);

      const person = async (
        permissions: readonly string[]
      ): Promise<ModuleRequestContext> => ({
        tenant,
        caller: principalFor({
          tenant,
          modules: [fixtureModule],
          userId: (await insertPersonWith(tenant, permissions)).userId,
          authenticated: true,
        }),
      });

      const core = ["list-datasets", "query-dataset", "open-record"];

      await expect(offered(await person(["core:ask:use"]))).resolves.toEqual({
        tools: [...core, "fixture-read"],
        writes: false,
      });
      await expect(
        offered(await person(["core:ask:use", "fixture:write"]))
      ).resolves.toEqual({
        tools: [...core, "fixture-read", "fixture-change"],
        writes: true,
      });
    } finally {
      await tenant.db.$client.end();
      await deployment.stop();
    }
  });
});

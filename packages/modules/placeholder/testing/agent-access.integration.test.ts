import {
  agentAccess,
  chatLabels,
  createTenantContext,
  principalFor,
  registerModuleRuntime,
  type TenantContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";

/** Ask's inbox link on the placeholder's document-inbox capability (Spec 7 R-42, P2). */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
    chat: "openai/gpt-6.1-terra",
    document: "anthropic/claude-opus-5.5",
  });
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, [placeholderModule]);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function inboxOf(
  userId: string,
  tenant: TenantContext = deployment.context
) {
  const access = await agentAccess({
    tenant,
    caller: principalFor({
      tenant,
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
  });

  return access.permitted ? access.inbox : "not permitted";
}

const personWith = async (permissions: readonly string[]) =>
  (await insertPersonWith(deployment.context, permissions)).userId;

/** A context of its own, so a changed entitlement is read past the 10 s cache (DEC-46). */
function freshTenant(): TenantContext {
  const tenant = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["placeholder"]
  );

  registerModuleRuntime(tenant, [placeholderModule]);

  return tenant;
}

describe("agentAccess on the placeholder", () => {
  it("links the placeholder's inbox only for a holder of placeholder:use while the module is on", async () => {
    const user = await personWith(["core:ask:use", "placeholder:use"]);
    const nonUser = await personWith(["core:ask:use"]);

    expect(await inboxOf(user)).toEqual([
      { label: "Placeholder", href: "/placeholder" },
    ]);
    expect(await inboxOf(nonUser)).toEqual([]);

    const tenant = freshTenant();

    try {
      await tenant.db.$client.query(
        "update tenant_module set enabled = false where module_id = 'placeholder'"
      );

      expect(await inboxOf(user, tenant)).toEqual([]);
    } finally {
      await tenant.db.$client.end();
      await enableModules(deployment.context, ["placeholder"]);
    }
  });
});

async function labelsOf(permissions: readonly string[]) {
  const userId = await personWith(permissions);
  const tenant = deployment.context;

  return chatLabels({
    tenant,
    caller: principalFor({
      tenant,
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
  });
}

describe("chatLabels on the placeholder", () => {
  it("names the placeholder's tool step, and its dataset title only for a reader", async () => {
    expect({
      reader: await labelsOf(["core:ask:use", "placeholder:read"]),
      other: await labelsOf(["core:ask:use"]),
    }).toEqual({
      reader: {
        labels: {
          steps: { "placeholder-count-records": "Counted the records" },
          datasets: { "placeholder.records": "Placeholder records" },
        },
        suggestions: [],
      },
      other: {
        labels: {
          steps: { "placeholder-count-records": "Counted the records" },
          datasets: {},
        },
        suggestions: [],
      },
    });
  });
});

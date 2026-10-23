import { describe, expect, it } from "vitest";

import {
  callProcedure,
  createRequestPrincipal,
  type ModuleRPCContext,
  type PermissionKey,
  type TenantContext,
} from "../../index.ts";
import { createCategoriesRouter } from "./router.ts";

// SAFETY: every case stops at the gate or at input validation, before a handler reads the tenant.
const tenant = {} as TenantContext;

function clientFor(keys: readonly PermissionKey[]) {
  const context: ModuleRPCContext = {
    tenant,
    caller: createRequestPrincipal(
      { userId: "test-user", groups: [], authenticated: true },
      () => Promise.resolve({ keys: new Set(keys), scopes: new Map() })
    ),
    requestId: "req-categories-router-test",
  };

  return callProcedure(createCategoriesRouter([]), context);
}

describe("the categories router", () => {
  it("refuses a caller without core:settings:manage before it parses the input", async () => {
    await expect(
      clientFor(["core:roles:manage"]).remove({ categoryId: "x" })
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("refuses every category id that is not a uuid before it reaches the database", async () => {
    const client = clientFor(["core:settings:manage"]);

    const refused = { code: "BAD_REQUEST" };

    await Promise.all([
      expect(
        client.rename({ categoryId: "x", name: "Ops" })
      ).rejects.toMatchObject(refused),
      expect(client.remove({ categoryId: "x" })).rejects.toMatchObject(refused),
      expect(client.reorder({ orderedIds: ["x"] })).rejects.toMatchObject(
        refused
      ),
    ]);
  });
});

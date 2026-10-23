import { describe, expect, it } from "vitest";

import {
  callProcedure,
  createRequestPrincipal,
  type ModuleRPCContext,
  type PermissionKey,
  type TenantContext,
} from "../../index.ts";
import { createModulesRouter } from "./router.ts";

// SAFETY: every case stops at the gate or at input validation, before a handler reads the tenant.
const tenant = {} as TenantContext;

function contextFor(keys: readonly PermissionKey[]): ModuleRPCContext {
  return {
    tenant,
    caller: createRequestPrincipal(
      { userId: "test-user", groups: [], authenticated: true },
      () => Promise.resolve({ keys: new Set(keys), scopes: new Map() })
    ),
    requestId: "req-modules-router-test",
  };
}

const malformedCategory = { moduleId: "placeholder", categoryId: "not-a-uuid" };

describe("the modules router", () => {
  it("refuses a caller without core:settings:manage before it parses the input", async () => {
    await expect(
      callProcedure(
        createModulesRouter([]),
        contextFor(["core:roles:manage"])
      ).setCategory(malformedCategory)
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses a category id that is not a uuid before it reaches the database", async () => {
    await expect(
      callProcedure(
        createModulesRouter([]),
        contextFor(["core:settings:manage"])
      ).setCategory(malformedCategory)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

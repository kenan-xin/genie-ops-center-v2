import { describe, expect, it } from "vitest";

import {
  callProcedure,
  createRequestPrincipal,
  type ModuleRPCContext,
  type PermissionKey,
  type TenantContext,
} from "../../index.ts";
import { createSettingsRouter } from "./router.ts";

// SAFETY: every case stops at the gate or at input validation, before a handler reads the tenant.
const tenant = {} as TenantContext;

function contextFor(keys: readonly PermissionKey[]): ModuleRPCContext {
  return {
    tenant,
    caller: createRequestPrincipal(
      { userId: "test-user", groups: [], authenticated: true },
      () => Promise.resolve({ keys: new Set(keys), scopes: new Map() })
    ),
    requestId: "req-settings-router-test",
  };
}

describe("the settings router", () => {
  it("refuses a module admin key alone on the read and on a malformed module save (R-75a)", async () => {
    const api = callProcedure(
      createSettingsRouter([]),
      contextFor(["placeholder:admin"])
    );

    await expect(api.read()).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      api.saveModule({ moduleId: "", values: {} })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses a malformed body from a manager before it reaches the database", async () => {
    await expect(
      callProcedure(
        createSettingsRouter([]),
        contextFor(["core:settings:manage"])
      ).saveSessions({ sessionIdleMinutes: Number.NaN })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

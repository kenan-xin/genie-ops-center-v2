import { describe, expect, it } from "vitest";

import {
  callProcedure,
  createRequestPrincipal,
  type ModuleRPCContext,
  type PermissionKey,
  type TenantContext,
} from "../../index.ts";
import { createBrandingRouter } from "./router.ts";

// SAFETY: every case stops at the gate, before a handler reads the tenant.
const tenant = {} as TenantContext;

function contextFor(keys: readonly PermissionKey[]): ModuleRPCContext {
  return {
    tenant,
    caller: createRequestPrincipal(
      { userId: "test-user", groups: [], authenticated: true },
      () => Promise.resolve({ keys: new Set(keys), scopes: new Map() })
    ),
    requestId: "req-branding-router-test",
  };
}

describe("the branding router", () => {
  it("refuses every procedure to a caller without core:branding:manage (R-95)", async () => {
    const api = callProcedure(
      createBrandingRouter(),
      contextFor(["core:settings:manage"])
    );

    await expect(api.read()).rejects.toMatchObject({ code: "forbidden" });
    await expect(api.publish({ draft: {} })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      api.upload({ slot: "favicon", file: new File(["x"], "favicon.ico") })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

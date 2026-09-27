import { describe, expect, it, vi } from "vitest";

import {
  AppError,
  createModuleTRPC,
  createRequestPrincipal,
  type ModuleRequestContext,
  type TenantContext,
} from "../../index.ts";

const REQUEST_ID = "req-module-trpc-test";

function contextWithEntitlement(enabled: boolean) {
  const calls: string[] = [];

  const isEnabled = (moduleId: string) => {
    calls.push(moduleId);

    return Promise.resolve(enabled);
  };

  // SAFETY: the builder reads only entitlements and requestId from the context, so the
  // tenant is a stub holding just the entitlement reader and the caller is the
  // Section 0 stub principal.
  const tenant = { entitlements: { isEnabled } } as TenantContext;

  return {
    context: {
      tenant,
      caller: createRequestPrincipal({ userId: "test-user", groups: [] }, () =>
        Promise.resolve({ keys: new Set(), scopes: new Map() })
      ),
      requestId: REQUEST_ID,
    } satisfies ModuleRequestContext & { readonly requestId: string },
    calls,
  };
}

describe("the module tRPC builder", () => {
  it("refuses a disabled module with the catalogue error and request id before the resolver", async () => {
    const resolve = vi.fn(() => "should not run");
    const t = createModuleTRPC("reports");
    const router = t.router({ value: t.procedure.query(resolve) });
    const { context, calls } = contextWithEntitlement(false);

    try {
      await router.createCaller(context).value();
      throw new Error("the disabled module procedure unexpectedly resolved");
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : error instanceof Error && "cause" in error
            ? error.cause
            : undefined;

      expect(appError).toMatchObject({
        code: "module-disabled",
        requestId: REQUEST_ID,
      });
    }

    expect(calls).toEqual(["reports"]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("runs the resolver when the module is enabled", async () => {
    const resolve = vi.fn(() => "allowed");
    const t = createModuleTRPC("reports");
    const router = t.router({ value: t.procedure.query(resolve) });
    const { context, calls } = contextWithEntitlement(true);

    await expect(router.createCaller(context).value()).resolves.toBe("allowed");

    expect(calls).toEqual(["reports"]);
    expect(resolve).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  AppError,
  createModuleTRPC,
  type ModuleRequestContext,
  type TenantContext,
} from "../../index.ts";

const REQUEST_ID = "req-module-trpc-test";

function contextWithEntitlement(enabled: boolean) {
  const isEnabled = vi.fn(() => Promise.resolve(enabled));

  // SAFETY: the builder reads only entitlements and requestId from this fixture context.
  const context = {
    tenant: { entitlements: { isEnabled } },
    requestId: REQUEST_ID,
  } as ModuleRequestContext & {
    readonly tenant: Pick<TenantContext, "entitlements">;
    readonly requestId: string;
  };

  return { context, isEnabled };
}

describe("the module tRPC builder", () => {
  it("refuses a disabled module with the catalogue error and request id before the resolver", async () => {
    const resolve = vi.fn(() => "should not run");
    const t = createModuleTRPC("reports");
    const router = t.router({ value: t.procedure.query(resolve) });
    const { context, isEnabled } = contextWithEntitlement(false);

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

    expect(isEnabled).toHaveBeenCalledExactlyOnceWith("reports");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("runs the resolver when the module is enabled", async () => {
    const resolve = vi.fn(() => "allowed");
    const t = createModuleTRPC("reports");
    const router = t.router({ value: t.procedure.query(resolve) });
    const { context, isEnabled } = contextWithEntitlement(true);

    await expect(router.createCaller(context).value()).resolves.toBe("allowed");

    expect(isEnabled).toHaveBeenCalledExactlyOnceWith("reports");
    expect(resolve).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  AppError,
  createModuleTRPC,
  createRequestPrincipal,
  type ModuleRequestContext,
  type TenantContext,
} from "../../index.ts";

const REQUEST_ID = "req-module-trpc-test";

function contextWithEntitlement(
  enabled: boolean,
  options: { readonly anonymous?: boolean } = {}
) {
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
      // The explicit flag, not the user id, is what makes the principal unauthenticated.
      caller: createRequestPrincipal(
        {
          userId: options.anonymous === true ? "anonymous" : "test-user",
          groups: [],
          authenticated: options.anonymous !== true,
        },
        () => Promise.resolve({ keys: new Set(), scopes: new Map() })
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

  it("refuses an anonymous caller with unauthenticated before input parsing and the resolver", async () => {
    const resolve = vi.fn(() => "should not run");
    let parserRan = false;

    const parse = (cause: unknown) => {
      parserRan = true;

      return cause;
    };

    const t = createModuleTRPC("reports");

    // `.input()` installs a parser that runs before the resolver: this proves the session check
    // is not pre-empted by it, the gap an envelope-only conversion could not close.
    const router = t.router({
      value: t.procedure.input(parse).query(resolve),
    });

    const { context, calls } = contextWithEntitlement(true, {
      anonymous: true,
    });

    await expect(
      router.createCaller(context).value("not-valid")
    ).rejects.toMatchObject({ cause: { code: "unauthenticated" } });

    expect(parserRan).toBe(false);
    expect(calls).toEqual(["reports"]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("keeps module-disabled first for an anonymous caller to a disabled module", async () => {
    const t = createModuleTRPC("reports");

    const router = t.router({
      value: t.procedure.query(() => "should not run"),
    });

    const { context } = contextWithEntitlement(false, { anonymous: true });

    await expect(router.createCaller(context).value()).rejects.toMatchObject({
      cause: { code: "module-disabled" },
    });
  });
});

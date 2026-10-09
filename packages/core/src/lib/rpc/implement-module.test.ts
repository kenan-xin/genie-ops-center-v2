import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  AppError,
  callProcedure,
  createRequestPrincipal,
  implementModule,
  type ModuleRPCContext,
  type TenantContext,
} from "../../index.ts";
import { oc } from "./index.ts";

const REQUEST_ID = "req-implement-module-test";

function contextWithEntitlement(
  enabled: boolean,
  options: { readonly anonymous?: boolean } = {}
) {
  const calls: string[] = [];

  const isEnabled = (moduleId: string) => {
    calls.push(moduleId);

    return Promise.resolve(enabled);
  };

  // SAFETY: the gate reads only entitlements and requestId from the context, so the tenant is a
  // stub holding just the entitlement reader and the caller is the Section 0 stub principal.
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
    } satisfies ModuleRPCContext,
    calls,
  };
}

const valueContract = {
  value: oc.route({ method: "POST", path: "/reports/value" }),
};

/** A router whose one procedure answers `resolve()`, built through core's module base. */
function reportsRouter(resolve: () => string) {
  const os = implementModule("reports", valueContract);

  return os.router({ value: os.value.handler(resolve) });
}

describe("the module implementer", () => {
  it("refuses a disabled module with the catalogue error and request id before the handler", async () => {
    const resolve = vi.fn(() => "should not run");
    const { context, calls } = contextWithEntitlement(false);

    const refusal = callProcedure(reportsRouter(resolve), context).value();

    await expect(refusal).rejects.toBeInstanceOf(AppError);
    await expect(refusal).rejects.toMatchObject({
      code: "module-disabled",
      requestId: REQUEST_ID,
    });

    // Once, not twice: the router-level copy of the gate is deduplicated (dedupeLeadingMiddlewares).
    expect(calls).toEqual(["reports"]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("runs the handler when the module is enabled", async () => {
    const resolve = vi.fn(() => "allowed");
    const { context, calls } = contextWithEntitlement(true);

    await expect(
      callProcedure(reportsRouter(resolve), context).value()
    ).resolves.toBe("allowed");

    expect(calls).toEqual(["reports"]);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("refuses an anonymous caller with unauthenticated before input parsing and the handler", async () => {
    const resolve = vi.fn(() => "should not run");
    let parserRan = false;

    // The input schema records that it ran: this proves the session check runs before input
    // validation, the order the implementer's own `.use()` gives (inputValidationIndex).
    const contract = {
      value: oc.route({ method: "POST", path: "/reports/value" }).input(
        z.custom(() => {
          parserRan = true;

          return false;
        })
      ),
    };

    const os = implementModule("reports", contract);
    const router = os.router({ value: os.value.handler(resolve) });

    const { context, calls } = contextWithEntitlement(true, {
      anonymous: true,
    });

    await expect(
      callProcedure(router, context).value("not-valid")
    ).rejects.toMatchObject({ code: "unauthenticated" });

    expect(parserRan).toBe(false);
    expect(calls).toEqual(["reports"]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("refuses invalid input to a disabled module with module-disabled, not a validation error", async () => {
    const contract = {
      value: oc
        .route({ method: "POST", path: "/reports/value" })
        .input(z.object({ count: z.number() })),
    };

    const os = implementModule("reports", contract);

    const router = os.router({
      value: os.value.handler(() => "should not run"),
    });

    const { context } = contextWithEntitlement(false);

    await expect(
      // SAFETY: the malformed input is the point of the case; the gate must answer before it is read.
      callProcedure(router, context).value({ count: "many" } as never)
    ).rejects.toMatchObject({ code: "module-disabled" });
  });

  it("keeps module-disabled first for an anonymous caller to a disabled module", async () => {
    const { context } = contextWithEntitlement(false, { anonymous: true });

    await expect(
      callProcedure(
        reportsRouter(() => "should not run"),
        context
      ).value()
    ).rejects.toMatchObject({ code: "module-disabled" });
  });
});

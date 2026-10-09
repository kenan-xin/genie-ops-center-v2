import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  auditContract,
  callProcedure,
  createGroupsRouter,
  createPeopleRouter,
  createRequestPrincipal,
  createRolesRouter,
  groupsContract,
  implementCoreArea,
  type ModuleRPCContext,
  peopleContract,
  type PermissionKey,
  rolesContract,
  type TenantContext,
} from "../../index.ts";
import { contractRouteProblems } from "./conformance.ts";
import { oc } from "./index.ts";

/** A core area must never consult entitlements, so reading one fails the test. */
function isEnabled(moduleId: string): Promise<boolean> {
  throw new Error(`a core area read the entitlement of "${moduleId}"`);
}

// SAFETY: these cases stop at the gates or input validation, before any handler reads the tenant,
// so the tenant is a stub holding only an entitlement reader that must not run.
const tenant = { entitlements: { isEnabled } } as TenantContext;

/** A request context whose caller holds `keys`. */
function contextFor(
  keys: readonly PermissionKey[],
  options: { readonly anonymous?: boolean } = {}
): ModuleRPCContext {
  return {
    tenant,
    caller: createRequestPrincipal(
      {
        userId: "test-user",
        groups: [],
        authenticated: options.anonymous !== true,
      },
      () => Promise.resolve({ keys: new Set(keys), scopes: new Map() })
    ),
    requestId: "req-core-area-test",
  };
}

describe("the core area implementer", () => {
  it("refuses an anonymous caller unauthenticated before input parsing, with no entitlement read", async () => {
    let parserRan = false;

    const contract = {
      value: oc.route({ method: "POST", path: "/groups/value" }).input(
        z.custom(() => {
          parserRan = true;

          return false;
        })
      ),
    };

    const os = implementCoreArea(contract);

    const router = os.router({
      value: os.value.handler(() => "should not run"),
    });

    await expect(
      callProcedure(router, contextFor([], { anonymous: true })).value("bad")
    ).rejects.toMatchObject({
      code: "unauthenticated",
      requestId: "req-core-area-test",
    });

    expect(parserRan).toBe(false);
  });

  it("runs an area's permission gate before input validation", async () => {
    const malformed = { groupId: "not-a-uuid" };

    await expect(
      callProcedure(createGroupsRouter(), contextFor([])).get(malformed)
    ).rejects.toMatchObject({ code: "forbidden" });

    // The same input from a holder of the key reaches validation, which refuses it.
    await expect(
      callProcedure(
        createGroupsRouter(),
        contextFor(["core:groups:manage"])
      ).get(malformed)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("gates each area on its own key", async () => {
    await expect(
      callProcedure(
        createPeopleRouter(),
        contextFor(["core:groups:manage"])
      ).list()
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      callProcedure(
        createRolesRouter([]),
        contextFor(["core:groups:manage"])
      ).get({
        roleId: "not-a-uuid",
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("routes every core area procedure by decision 7 under its own area", () => {
    expect(contractRouteProblems("audit", auditContract)).toEqual([]);
    expect(contractRouteProblems("groups", groupsContract)).toEqual([]);
    expect(contractRouteProblems("people", peopleContract)).toEqual([]);
    expect(contractRouteProblems("roles", rolesContract)).toEqual([]);

    // The check is live: a contract under another area's prefix is refused.
    expect(contractRouteProblems("people", groupsContract)).not.toEqual([]);
  });
});

import {
  getHiddenRouterContract,
  traverseContractProcedures,
} from "@orpc/server";
import { describe, expect, it } from "vitest";

import { implementModule } from "./implement-module.ts";
import { oc } from "./index.ts";

/**
 * Two oRPC 1.15.5 helpers the conformance check and the OpenAPI build read (ADR 0011, "oRPC
 * behaviors the code relies on"). A version that changes their shape fails here, not in validation.
 */
const contract = {
  read: oc.route({ method: "GET", path: "/reports/read" }),
  nested: { write: oc.route({ method: "POST", path: "/reports/write" }) },
};

describe("the oRPC contract helpers", () => {
  it("getHiddenRouterContract answers the contract a router was built from", () => {
    const os = implementModule("reports", contract);

    const router = os.router({
      read: os.read.handler(() => "read"),
      nested: { write: os.nested.write.handler(() => "written") },
    });

    expect(getHiddenRouterContract(router)).toBe(contract);
  });

  it("traverseContractProcedures visits each procedure with its path and contract", () => {
    const visited: { path: readonly string[]; contract: unknown }[] = [];

    traverseContractProcedures({ router: contract, path: [] }, (procedure) => {
      visited.push({ path: procedure.path, contract: procedure.contract });
    });

    expect(visited).toEqual([
      { path: ["read"], contract: contract.read },
      { path: ["nested", "write"], contract: contract.nested.write },
    ]);
  });
});

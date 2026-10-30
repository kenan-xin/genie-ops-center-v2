import { implementModule } from "@genie/core";
import { oc } from "@genie/core/rpc";
import { describe, expect, it } from "vitest";

import { composeRouter, createAppRouter } from "./router.ts";

const contract = { read: oc.route({ method: "POST", path: "/reports/read" }) };

const os = implementModule("reports", contract);

const router = os.router({ read: os.read.handler(() => "read") });

describe("createAppRouter", () => {
  it("mounts core's nine areas beside the modules", () => {
    expect(Object.keys(createAppRouter([]))).toEqual([
      "audit",
      "groups",
      "people",
      "roles",
      "modules",
      "categories",
      "settings",
      "branding",
      "agent",
    ]);
  });
});

describe("composeRouter", () => {
  it("keys each entry by its id", () => {
    expect(
      Object.keys(
        composeRouter([
          ["reports", router],
          ["audit", router],
        ])
      )
    ).toEqual(["reports", "audit"]);
  });

  it("throws when two entries claim one key", () => {
    expect(() =>
      composeRouter([
        ["audit", router],
        ["audit", router],
      ])
    ).toThrow('The RPC router has two entries under "audit".');
  });
});

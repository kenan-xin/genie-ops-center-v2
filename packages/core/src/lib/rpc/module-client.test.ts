import { describe, expect, it } from "vitest";

import { oc } from "./index.ts";
import { moduleClientOf } from "./module-client.tsx";

describe("the module client", () => {
  it("hands a module the client under the id its contract paths start with", () => {
    const reports = { totals: { value: () => "reports" } };
    const root = { other: { totals: { value: () => "other" } }, reports };

    const flat = {
      value: oc.route({ method: "POST", path: "/reports/value" }),
    };

    const nested = {
      totals: {
        value: oc.route({ method: "POST", path: "/reports/totals/value" }),
      },
    };

    expect(moduleClientOf(root, flat)).toBe(reports);
    expect(moduleClientOf(root, nested)).toBe(reports);
  });
});

import { describe, expect, it } from "vitest";

import { definePage } from "../../lib/module-contract/module.ts";
import { matchModulePage, moduleRouteOwner, type PageModule } from "./match.ts";

const Empty = () => null;

const reports: PageModule = {
  identity: { id: "reports", displayName: "Reports", version: "0.0.0" },
  navigation: { pinned: [], entries: [] },
  pages: {
    workspace: [
      definePage({
        path: "/reports",
        permission: "reports:use",
        component: Empty,
      }),
      // Declared before its static sibling, so the archive row pins ranking, not order.
      definePage({
        path: "/reports/:id",
        permission: "reports:use",
        record: { type: "reports-record", param: "id" },
        component: Empty,
      }),
      definePage({
        path: "/reports/archive",
        permission: "reports:use",
        component: Empty,
      }),
      definePage({
        path: "/reports/:id/lines/:lineId",
        permission: "reports:use",
        component: Empty,
      }),
      definePage({
        path: "/reports/x/y",
        permission: "other:use",
        component: Empty,
      }),
    ],
    admin: [
      definePage({
        path: "/admin/reports",
        permission: "reports:admin",
        component: Empty,
      }),
    ],
  },
};

describe("module pages", () => {
  it.each([
    ["workspace", ["reports"], "/reports", {}],
    ["workspace", ["reports", "archive"], "/reports/archive", {}],
    ["workspace", ["reports", "r-1"], "/reports/:id", { id: "r-1" }],
    ["workspace", ["reports", "a/b"], "/reports/:id", { id: "a/b" }],
    [
      "workspace",
      ["reports", "r-1", "lines", "l-2"],
      "/reports/:id/lines/:lineId",
      { id: "r-1", lineId: "l-2" },
    ],
    ["workspace", ["reports", "r-1", "extra"], undefined, undefined],
    ["workspace", ["reports", "x", "y"], undefined, undefined],
    ["workspace", ["admin", "reports"], undefined, undefined],
    ["admin", ["admin", "reports"], "/admin/reports", {}],
  ] as const)("matches %s %j to %s", (surface, segments, path, params) => {
    const match = matchModulePage(reports, surface, segments);

    expect(match?.page.path).toBe(path);
    expect(match?.params).toEqual(params);
  });

  it.each([
    ["/reports", "reports"],
    ["/reports/", "reports"],
    ["/reports/r-1", "reports"],
    ["/admin/reports", "reports"],
    ["/reports/%61rchive", "reports"],
    ["/reports/a%2Fb", "reports"],
    // Only the static admin page matches once decoded; no parameter page hides a raw compare.
    ["/admin/%72eports", "reports"],
    ["/reports/%E0%A4%A", undefined],
    ["/reports/r-1/extra", undefined],
    ["/reports/x/y", undefined],
    ["/account", undefined],
  ] as const)("names the owner of %s as %s", (pathname, owner) => {
    expect(moduleRouteOwner([reports], pathname)).toBe(owner);
  });
});

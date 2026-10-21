import { describe, expect, it } from "vitest";

import { viewerRouteFor } from "./viewer-routes.ts";

const known = new Set(["placeholder"]);

describe("viewerRouteFor", () => {
  it("matches the exact viewer document path", () => {
    expect(viewerRouteFor("/viewer/placeholder", known)).toEqual({
      moduleId: "placeholder",
    });
  });

  it("matches the same path with a trailing slash", () => {
    expect(viewerRouteFor("/viewer/placeholder/", known)).toEqual({
      moduleId: "placeholder",
    });
  });

  it("does not match a deeper path under the viewer prefix", () => {
    expect(viewerRouteFor("/viewer/placeholder/extra", known)).toBeUndefined();
  });

  it("does not match an unknown module id", () => {
    expect(viewerRouteFor("/viewer/not-compiled", known)).toBeUndefined();
  });

  it("does not match the bare prefix", () => {
    expect(viewerRouteFor("/viewer", known)).toBeUndefined();
  });

  it("matches nothing when no provider has been published", () => {
    expect(viewerRouteFor("/viewer/placeholder", new Set())).toBeUndefined();
  });
});

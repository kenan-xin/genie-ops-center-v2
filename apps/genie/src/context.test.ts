import { describe, expect, it } from "vitest";

import {
  constructionCount,
  publishContext,
  readContext,
  requireContext,
} from "./context.ts";

// SAFETY: the seam only stores and returns whatever it is handed, and this test
// reads nothing but the identity of that value. A real context would open a pool,
// which the seam test must not do, so the fixture stands in for one.
const fakeContext = {
  tenant: {},
  startedAt: 0,
  contextId: "ctx-test",
  viewerProviders: new Map(),
  reportProviderFailure: () => {},
} as never;

describe("the application context seam", () => {
  it("has nothing published before the bootstrap runs", () => {
    expect(readContext()).toBeUndefined();
  });

  it("refuses to hand out a context that was never published", () => {
    expect(() => requireContext()).toThrow(/bootstrap/i);
  });

  it("counts one construction after one publish", () => {
    publishContext(fakeContext);

    expect(readContext()).toBe(fakeContext);
    expect(constructionCount()).toBe(1);
  });

  it("refuses a second publish, because one process owns one context", () => {
    expect(() => publishContext(fakeContext)).toThrow(/already/i);
    expect(constructionCount()).toBe(1);
  });
});

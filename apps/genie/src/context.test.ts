import { describe, expect, it } from "vitest";

import { publishContext, readContext, requireContext } from "./context.ts";

// SAFETY: the seam only stores and returns whatever it is handed, and this test
// reads nothing but the identity of that value. A real context would open a pool,
// which the seam test must not do, so the fixture stands in for one. It carries
// the full `AppContext` shape, including the two logger seams, because it is
// published onto the real process global and a member left out would make this
// fixture diverge from the type the bootstrap publishes.
const fakeContext = {
  tenant: {},
  startedAt: 0,
  contextId: "ctx-test",
  viewerProviders: new Map(),
  reportProviderFailure: () => {},
  logRequest: () => {},
  logError: () => {},
} as never;

describe("the application context seam", () => {
  it("has nothing published before the bootstrap runs", () => {
    expect(readContext()).toBeUndefined();
  });

  it("refuses to hand out a context that was never published", () => {
    expect(() => requireContext()).toThrow(/bootstrap/i);
  });

  it("hands back the context it published", () => {
    publishContext(fakeContext);

    expect(readContext()).toBe(fakeContext);
  });

  it("refuses a second publish, because one process owns one context", () => {
    expect(() => publishContext(fakeContext)).toThrow(/already/i);
  });
});

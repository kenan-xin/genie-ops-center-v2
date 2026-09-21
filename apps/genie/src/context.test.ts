import { describe, expect, it } from "vitest";

import {
  publishContext,
  readContext,
  requireContext,
  type AppContext,
} from "./context.ts";

// The seam only stores and returns whatever it is handed, and this test reads
// nothing but the identity of that value. A real context would open a pool, which
// the seam test must not do, so the fixture stands in for one.
//
// It is annotated `AppContext` rather than cast to it, so a member the bootstrap
// adds is a compile error here until the fixture carries it too — which is the
// property the earlier `as never` cast silently removed. The one member the seam
// never reads, `tenant`, is the only one that is cast.
//
// SAFETY: the seam stores this value and hands it back without reading any
// member, and this test asserts only its identity, so the empty `tenant` is
// never dereferenced.
const fakeContext: AppContext = {
  tenant: {} as AppContext["tenant"],
  startedAt: 0,
  contextId: "ctx-test",
  viewerProviders: new Map(),
  reportProviderFailure: () => {},
  logRequest: () => {},
  logError: () => {},
};

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

import { describe, expect, it } from "vitest";

import { tenantInitial } from "./tenant-initial.ts";

describe("tenantInitial", () => {
  it("upper-cases the first letter", () => {
    expect(tenantInitial("acme health")).toBe("A");
  });

  it("skips leading spaces", () => {
    expect(tenantInitial("   acme")).toBe("A");
  });

  it("keeps a leading emoji whole, not half a surrogate pair", () => {
    expect(tenantInitial("🏥 Clinic")).toBe("🏥");
  });

  it("answers undefined for a blank name", () => {
    expect(tenantInitial("   ")).toBeUndefined();
  });
});

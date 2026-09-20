import { describe, expect, it } from "vitest";

import { isPermissionKey, permissionKeyFor } from "./keys.ts";

describe("isPermissionKey", () => {
  it("accepts the <id>:<action> form", () => {
    expect(isPermissionKey("placeholder:read")).toBe(true);
  });

  it("refuses a key without an action", () => {
    expect(isPermissionKey("placeholder")).toBe(false);
  });

  it("refuses a key with two separators", () => {
    expect(isPermissionKey("core:settings:manage")).toBe(false);
  });

  it("refuses a module part that is not kebab-case", () => {
    expect(isPermissionKey("Placeholder:read")).toBe(false);
  });
});

describe("permissionKeyFor", () => {
  it("joins the module id and the action", () => {
    expect(permissionKeyFor("placeholder", "read")).toBe("placeholder:read");
  });

  it("refuses an identifier that is not kebab-case", () => {
    expect(() => permissionKeyFor("Placeholder", "read")).toThrow("kebab-case");
  });
});

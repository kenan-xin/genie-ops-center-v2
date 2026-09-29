import { describe, expect, it } from "vitest";

import { isLimitedBreakGlass } from "./limited.ts";

/**
 * R-30, R-65: a break-glass session is limited while the password change or the authenticator
 * enrollment is outstanding, and never for anyone else.
 */
describe("the limited break-glass session", () => {
  it("is limited until both the password change and the enrollment are done", () => {
    expect(
      isLimitedBreakGlass({
        isBreakGlass: true,
        mustChangePassword: true,
        twoFactorEnabled: false,
      })
    ).toBe(true);

    expect(
      isLimitedBreakGlass({
        isBreakGlass: true,
        mustChangePassword: true,
        twoFactorEnabled: true,
      })
    ).toBe(true);

    expect(
      isLimitedBreakGlass({
        isBreakGlass: true,
        mustChangePassword: false,
        twoFactorEnabled: false,
      })
    ).toBe(true);
  });

  it("is unlimited once both are done", () => {
    expect(
      isLimitedBreakGlass({
        isBreakGlass: true,
        mustChangePassword: false,
        twoFactorEnabled: true,
      })
    ).toBe(false);
  });

  it("never limits an ordinary person, whatever their flags say", () => {
    expect(
      isLimitedBreakGlass({
        isBreakGlass: false,
        mustChangePassword: true,
        twoFactorEnabled: false,
      })
    ).toBe(false);
  });
});

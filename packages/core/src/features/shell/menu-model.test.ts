import { describe, expect, it } from "vitest";

import { shellMenu, type ShellMenuInput } from "./menu-model.ts";

const administrator: ShellMenuInput = {
  chrome: "workspace",
  isAdministrator: true,
  isBreakGlass: false,
  landing: "/orders",
  adminHome: "/admin/people",
  changePasswordHref: null,
  supportHref: null,
  labels: {
    backToWorkspace: "Back to workspace",
    administration: "Administration",
  },
};

describe("shellMenu", () => {
  it("sends an administrator in the workspace to the admin home", () => {
    const menu = shellMenu(administrator);

    expect(menu.switchTarget).toEqual({
      label: "Administration",
      href: "/admin/people",
    });
    expect(menu.accountHref).toBe("/account");
    expect(menu.signOutAction).toBe("/api/auth/sign-out");
  });

  it("sends an administrator in the admin chrome back to the landing route, else home", () => {
    expect(
      shellMenu({ ...administrator, chrome: "admin" }).switchTarget
    ).toEqual({
      label: "Back to workspace",
      href: "/orders",
    });
    expect(
      shellMenu({ ...administrator, chrome: "admin", landing: undefined })
        .switchTarget?.href
    ).toBe("/");
  });

  it("gives a member no switch", () => {
    const member = {
      ...administrator,
      isAdministrator: false,
      adminHome: undefined,
    };

    expect(shellMenu(member).switchTarget).toBeNull();
    expect(shellMenu({ ...member, chrome: "admin" }).switchTarget).toBeNull();
  });

  it("links the break-glass account to the admin account page and gives it no switch", () => {
    const menu = shellMenu({
      ...administrator,
      chrome: "admin",
      isBreakGlass: true,
    });

    expect(menu.accountHref).toBe("/admin/account");
    expect(menu.switchTarget).toBeNull();
    expect(menu.signOutAction).toBe("/api/auth/sign-out");
  });
});

import type { ShellChrome, ShellMenu } from "./types.ts";

export type ShellMenuInput = {
  readonly chrome: ShellChrome;
  readonly isAdministrator: boolean;
  readonly isBreakGlass: boolean;
  readonly landing: string | undefined;
  readonly adminHome: string | undefined;
  readonly changePasswordHref: string | null;
  readonly supportHref: string | null;
  readonly labels: {
    readonly backToWorkspace: string;
    readonly administration: string;
  };
};

/**
 * The chrome a page gets. A person with no admin entry has an empty admin chrome, so an admin page
 * that refuses them shows its no-access state inside the workspace chrome (shell L-4).
 */
export function shellChrome(
  requested: ShellChrome,
  isAdministrator: boolean
): ShellChrome {
  return requested === "admin" && !isAdministrator ? "workspace" : requested;
}

/**
 * The user menu as plain data (Spec 3 R-32), so a custom app can draw the same menu in its own
 * shell. Only an administrator gets the chrome switch, the break-glass account has its own account
 * page and no switch, because it lives only in the admin chrome (design `account-and-inbox`), and
 * every menu signs out through the one auth route.
 */
export function shellMenu(input: ShellMenuInput): ShellMenu {
  const switchTarget =
    !input.isAdministrator || input.isBreakGlass
      ? null
      : input.chrome === "admin"
        ? { label: input.labels.backToWorkspace, href: input.landing ?? "/" }
        : input.adminHome === undefined
          ? null
          : { label: input.labels.administration, href: input.adminHome };

  return {
    accountHref: input.isBreakGlass ? "/admin/account" : "/account",
    changePasswordHref: input.changePasswordHref,
    switchTarget,
    supportHref: input.supportHref,
    signOutAction: "/api/auth/sign-out",
  };
}

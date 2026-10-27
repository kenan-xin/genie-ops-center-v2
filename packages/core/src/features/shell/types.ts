import type { ComponentPropsWithRef, ComponentType } from "react";

/**
 * The shell's view model as the browser receives it. Links carry no permission key: the server
 * already filtered them (Spec 3 R-30).
 */
export type ShellChrome = "workspace" | "admin";

/**
 * The anchor an internal shell link renders through: the host's router link, such as `next/link`.
 * It takes the props the shell sets. A menu item also passes its own props at run time, which a
 * router link forwards to its anchor.
 */
export type ShellLinkComponent = ComponentType<
  Pick<
    ComponentPropsWithRef<"a">,
    "aria-current" | "children" | "className" | "ref" | "title"
  > & { readonly href: string }
>;

export type ShellLink = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
};

export type ShellCategory = {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly ShellLink[];
};

export type ShellAdminGroup = {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly ShellLink[];
};

export type ShellNavigation = {
  readonly pinned: readonly ShellLink[];
  readonly workspace: readonly ShellLink[];
  readonly categories: readonly ShellCategory[];
  readonly admin: readonly ShellAdminGroup[];
};

export type ShellIdentity = {
  readonly companyName: string;
  readonly productName: string;
  readonly logoLightUrl: string | null;
  readonly logoDarkUrl: string | null;
  readonly markUrl: string | null;
};

export type ShellUser = { readonly name: string; readonly roleLabel: string };

export type ShellMenu = {
  readonly accountHref: string;
  readonly changePasswordHref: string | null;
  readonly switchTarget: {
    readonly label: string;
    readonly href: string;
  } | null;
  readonly supportHref: string | null;
  readonly signOutAction: string;
};

export type ShellStrings = {
  readonly workspace: string;
  readonly adminPortal: string;
  readonly pinned: string;
  readonly categories: string;
  readonly navigation: string;
  readonly openNavigation: string;
  readonly closeNavigation: string;
  readonly offline: string;
  readonly pageContent: string;
  readonly account: string;
  readonly changePassword: string;
  readonly opensInNewTab: string;
  readonly helpAndSupport: string;
  readonly signOut: string;
};

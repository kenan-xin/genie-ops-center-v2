"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  focusRing,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@genie/ui";
import {
  ArrowLeftRight,
  ChevronsUpDown,
  ExternalLink,
  KeyRound,
  LifeBuoy,
  LogOut,
  UserRound,
} from "lucide-react";
import { useRef, type ComponentProps } from "react";

import { initials } from "../audit/helpers.ts";
import { linkFor } from "./shell-link.ts";
import type {
  ShellLinkComponent,
  ShellMenu,
  ShellStrings,
  ShellUser,
} from "./types.ts";

export type UserMenuProps = {
  readonly user: ShellUser;
  readonly menu: ShellMenu;
  readonly linkComponent?: ShellLinkComponent | undefined;
  readonly strings: Pick<
    ShellStrings,
    | "account"
    | "changePassword"
    | "opensInNewTab"
    | "helpAndSupport"
    | "signOut"
  >;
};

const icon = "size-4 text-muted-foreground";

// The footer row the menu trigger renders as; the Base UI trigger carries no style of its own.
function FooterButton(props: ComponentProps<"button">) {
  return (
    <button
      {...props}
      type="button"
      className={`flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-border/60 data-popup-open:bg-border/60 motion-safe:transition-colors ${focusRing}`}
    />
  );
}

/**
 * The user footer (R-32). The menu opens upward. Account and the chrome switch render through the
 * host's link component (NAV-1); Change password and Help and support are plain links, and Sign
 * out posts the controlled sign-out form.
 */
export function UserMenu(props: UserMenuProps) {
  const { user, menu, strings } = props;
  const signOutForm = useRef<HTMLFormElement>(null);

  const AccountLink = linkFor(menu.accountHref, props.linkComponent);

  const SwitchLink =
    menu.switchTarget === null
      ? "a"
      : linkFor(menu.switchTarget.href, props.linkComponent);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger data-shell-user-menu="" render={<FooterButton />}>
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-border/60 text-xs font-bold text-foreground"
          >
            {initials(user.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <Tooltip>
              <TooltipTrigger render={<span className="block min-w-0" />}>
                <span className="block max-w-full truncate text-sm font-semibold text-foreground">
                  {user.name}
                </span>
              </TooltipTrigger>
              <TooltipContent>{user.name}</TooltipContent>
            </Tooltip>
            <span className="block max-w-full truncate text-xs text-muted-foreground">
              {user.roleLabel}
            </span>
          </span>
          <ChevronsUpDown
            aria-hidden
            strokeWidth={1.75}
            className="size-4 shrink-0 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuItem
            size="lg"
            render={<AccountLink href={menu.accountHref} />}
          >
            <UserRound aria-hidden strokeWidth={1.75} className={icon} />
            {strings.account}
          </DropdownMenuItem>
          {menu.changePasswordHref === null ? null : (
            <DropdownMenuItem
              size="lg"
              render={
                <a
                  href={menu.changePasswordHref}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <KeyRound aria-hidden strokeWidth={1.75} className={icon} />
              <span className="flex-1">{strings.changePassword}</span>
              <ExternalLink aria-hidden strokeWidth={1.75} className={icon} />
              <span className="sr-only">{strings.opensInNewTab}</span>
            </DropdownMenuItem>
          )}
          {menu.switchTarget === null ? null : (
            <DropdownMenuItem
              size="lg"
              render={<SwitchLink href={menu.switchTarget.href} />}
            >
              <ArrowLeftRight aria-hidden strokeWidth={1.75} className={icon} />
              {menu.switchTarget.label}
            </DropdownMenuItem>
          )}
          {menu.supportHref === null ? null : (
            <DropdownMenuItem size="lg" render={<a href={menu.supportHref} />}>
              <LifeBuoy aria-hidden strokeWidth={1.75} className={icon} />
              {strings.helpAndSupport}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            size="lg"
            onClick={() => signOutForm.current?.requestSubmit()}
          >
            <LogOut aria-hidden strokeWidth={1.75} className={icon} />
            {strings.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the popup, so it stays mounted after the menu closes. */}
      <form
        ref={signOutForm}
        method="post"
        action={menu.signOutAction}
        hidden
      />
    </>
  );
}

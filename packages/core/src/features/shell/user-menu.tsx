"use client";

import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  focusRing,
  iconLeadPx,
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
  /** The 60 px icon rail: the avatar alone, with the name and role as hidden text. */
  readonly rail?: boolean | undefined;
};

const icon = "size-4 text-muted-foreground";

// These glyphs' ink starts 2.1 px into the box, the others' 0.8 to 1.4 px; the menu row moves a
// leading icon by 1 px, so these take the 2 px offset to share one ink edge (6wz1.113, P07-72).
const wideIcon = `${icon} ${iconLeadPx[2]}`;

// The footer row the menu trigger renders as; the Base UI trigger carries no style of its own.
function FooterButton({
  rail,
  ...props
}: ComponentProps<"button"> & { readonly rail: boolean }) {
  return (
    <button
      {...props}
      type="button"
      className={`flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg py-2 text-left hover:bg-hover data-popup-open:bg-hover motion-safe:transition-colors ${rail ? "justify-center" : "px-2"} ${focusRing}`}
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
        <DropdownMenuTrigger
          data-shell-user-menu=""
          render={<FooterButton rail={props.rail === true} />}
        >
          <Avatar aria-hidden="true">
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          {props.rail === true ? (
            <span className="sr-only">
              {user.email === "" ? user.name : `${user.name}, ${user.email}`}
            </span>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                {/* The chevron ends the name's line, so it centers on the name, not on both lines (6wz1.113). */}
                <span className="flex w-full min-w-0 items-center gap-3">
                  <Tooltip>
                    {/* max-w-full: in an items-start column the trigger would size to its text. */}
                    <TooltipTrigger
                      render={
                        <span className="block max-w-full min-w-0 flex-1" />
                      }
                    >
                      <span className="block max-w-full truncate text-sm font-semibold text-foreground">
                        {user.name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{user.name}</TooltipContent>
                  </Tooltip>
                  <ChevronsUpDown
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </span>
                {user.email === "" ? null : (
                  // title: a long email truncates, so the full text stays reachable.
                  <span
                    title={user.email}
                    className="block max-w-full truncate text-xs text-muted-foreground"
                  >
                    {user.email}
                  </span>
                )}
              </span>
            </>
          )}
        </DropdownMenuTrigger>
        {/* At least 224 px, so a 60 px rail trigger does not wrap the rows (6wz1.113, P07-77). */}
        <DropdownMenuContent side="top" align="start" className="min-w-56">
          <DropdownMenuItem
            size="lg"
            render={<AccountLink href={menu.accountHref} />}
          >
            <UserRound aria-hidden strokeWidth={1.75} className={wideIcon} />
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
              <ArrowLeftRight
                aria-hidden
                strokeWidth={1.75}
                className={wideIcon}
              />
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

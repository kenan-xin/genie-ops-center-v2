"use client";

import { focusRing, Sheet, SheetContent, SheetTitle } from "@genie/ui";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { activeHref, shellLinks } from "./active-link.ts";
import { IdentityBlock, TenantMark } from "./identity-block.tsx";
import { NavigationRail } from "./navigation-rail.tsx";
import { OfflineBar } from "./offline-bar.tsx";
import { ShellContext } from "./shell-context.ts";
import type {
  ShellChrome,
  ShellIdentity,
  ShellMenu,
  ShellNavigation,
  ShellStrings,
  ShellUser,
} from "./types.ts";
import { UserMenu } from "./user-menu.tsx";

export type AppShellProps = {
  readonly chrome: ShellChrome;
  readonly title?: string;
  readonly currentPath: string;
  readonly navigation: ShellNavigation;
  readonly identity: ShellIdentity;
  readonly user: ShellUser;
  readonly menu: ShellMenu;
  readonly strings: ShellStrings;
  readonly children: ReactNode;
};

const iconButton = `flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-border/60 motion-safe:transition-colors ${focusRing}`;

/** The one panel the desktop aside and the phone drawer both hold. */
function Panel(props: AppShellProps) {
  return (
    <>
      <IdentityBlock
        chrome={props.chrome}
        identity={props.identity}
        adminPortalLabel={props.strings.adminPortal}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <NavigationRail
          chrome={props.chrome}
          navigation={props.navigation}
          currentPath={props.currentPath}
          strings={props.strings}
        />
      </div>
      <div className="border-t border-border p-2">
        <UserMenu user={props.user} menu={props.menu} strings={props.strings} />
      </div>
    </>
  );
}

/**
 * The signed-in frame (R-27, R-35, R-38, R-40). From `lg` the panel is an aside beside the
 * content; below `lg` a top bar shows the title and opens the same panel in a drawer, the only
 * navigation there. The page brings its own `<main>` and `<h1>`; the shell adds neither.
 */
export function AppShell(props: AppShellProps) {
  const { strings } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = activeHref(props.navigation, props.currentPath);

  const title =
    props.title ??
    shellLinks(props.navigation).find((link) => link.href === active)?.label ??
    (props.chrome === "admin" ? strings.adminPortal : strings.workspace);

  return (
    <div
      data-shell=""
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <OfflineBar message={strings.offline} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-3 lg:p-3">
        <aside
          aria-label={strings.navigation}
          className="hidden w-60 shrink-0 flex-col rounded-xl border border-border bg-muted lg:flex"
        >
          <Panel {...props} />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            data-shell-top-bar=""
            className="flex h-13.5 shrink-0 items-center gap-3 border-b border-border px-2 lg:hidden"
          >
            <button
              type="button"
              aria-label={strings.openNavigation}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              className={iconButton}
            >
              <Menu aria-hidden strokeWidth={1.75} className="size-5" />
            </button>
            <TenantMark identity={props.identity} size="sm" />
            <p
              aria-hidden="true"
              title={title}
              className="min-w-0 flex-1 truncate text-base font-semibold"
            >
              {title}
            </p>
            <div data-shell-slot="search" aria-hidden="true" />
          </header>
          <div
            data-shell-content=""
            className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6 lg:px-8 lg:py-2 has-[[data-shell-bottom-bar]]:max-md:pb-20"
          >
            <ShellContext.Provider value={{ chrome: props.chrome }}>
              {props.children}
            </ShellContext.Provider>
          </div>
        </div>
      </div>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          // 5/6 is the scale value nearest the design's 84vw; the lint refuses arbitrary widths.
          className="max-w-80 data-[side=left]:w-5/6"
        >
          <SheetTitle className="sr-only">{strings.navigation}</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex justify-end p-1">
              <button
                type="button"
                aria-label={strings.closeNavigation}
                onClick={() => setDrawerOpen(false)}
                className={iconButton}
              >
                <X aria-hidden strokeWidth={1.75} className="size-5" />
              </button>
            </div>
            <Panel {...props} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

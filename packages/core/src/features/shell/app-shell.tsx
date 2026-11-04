"use client";

import {
  Button,
  focusRing,
  Kbd,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useMediaQuery,
} from "@genie/ui";
import { ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AgentButton } from "../agent/agent-button.tsx";
import { activeHref, isAskPath, shellLinks } from "./active-link.ts";
import { IdentityBlock, TenantMark } from "./identity-block.tsx";
import { deviceStorage, NavigationRail } from "./navigation-rail.tsx";
import { OfflineBar } from "./offline-bar.tsx";
import { ShellContext } from "./shell-context.ts";
import { readRail, writeRail } from "./sidebar-rail.ts";
import type {
  ShellChrome,
  ShellIdentity,
  ShellLinkComponent,
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
  readonly linkComponent?: ShellLinkComponent;
  /** The general chat of every page, usually a `ChatDock`; it steps aside for a page's own chat. */
  readonly chat?: ReactNode;
  /** The agent panel host; the app passes it only for a person who may use the agent. */
  readonly agentPanel?: ReactNode;
};

const iconButton = `flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-border/60 motion-safe:transition-colors ${focusRing}`;

/** A key event from a place where the person types, where Ctrl+B must not move the menu. */
function fromTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select") !== null)
  );
}

/**
 * The one panel the desktop aside and the phone drawer both hold. Only the aside passes `toggle`,
 * so the drawer never shows the rail toggle.
 */
function Panel(
  props: AppShellProps & {
    readonly rail?: boolean;
    readonly toggle?: ReactNode;
  }
) {
  const rail = props.rail === true;

  return (
    <>
      {/* One wrapper in both states, so the toggle keeps its node and its focus. */}
      <div
        className={
          rail
            ? "flex flex-col items-center gap-1.5 pb-1"
            : "flex items-center pe-2"
        }
      >
        <div className={rail ? "" : "min-w-0 flex-1"}>
          <IdentityBlock
            chrome={props.chrome}
            identity={props.identity}
            adminPortalLabel={props.strings.adminPortal}
            rail={rail}
          />
        </div>
        {props.toggle}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <NavigationRail
          chrome={props.chrome}
          navigation={props.navigation}
          currentPath={props.currentPath}
          strings={props.strings}
          linkComponent={props.linkComponent}
          rail={rail}
        />
      </div>
      <div className="border-t border-border p-2">
        <UserMenu
          user={props.user}
          menu={props.menu}
          strings={props.strings}
          linkComponent={props.linkComponent}
          rail={rail}
        />
      </div>
    </>
  );
}

/**
 * The signed-in frame (R-27, R-35, R-38, R-40). From `lg` the panel is an aside beside the
 * content; below `lg` a top bar shows the title and opens the same panel in a drawer, the only
 * navigation there. The page brings its own `<main>` and `<h1>`; the shell adds neither.
 * Internal links render through `linkComponent`, and a plain anchor is the default (NAV-1).
 * A new `currentPath` closes the drawer and starts the content area at the top, so a host that
 * keeps the shell in a layout gets the behavior of a document load (R-38).
 */
export function AppShell(props: AppShellProps) {
  const { strings } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shownPath, setShownPath] = useState(props.currentPath);
  const content = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const scrolledPath = useRef(props.currentPath);
  const navigationId = useId();
  const wide = useMediaQuery("(min-width: 1024px)", {});

  // The server render is the open menu; the device's choice applies after mount (R-31 pattern).
  const [storedRail, setStoredRail] = useState(false);
  // Each arrival at Ask starts as the rail, and a toggle there is never stored (R-42a, SD5).
  const [askRail, setAskRail] = useState(true);

  useEffect(() => {
    setStoredRail(readRail(deviceStorage()));
  }, []);

  const onAsk = isAskPath(props.currentPath);
  const rail = onAsk ? askRail : storedRail;

  const toggleRail = () => {
    if (onAsk) {
      setAskRail(!rail);
    } else {
      setStoredRail(!rail);
      writeRail(deviceStorage(), !rail);
    }
  };

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key.toLowerCase() !== "b" ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey ||
      fromTyping(event.target)
    )
      return;

    event.preventDefault();
    toggleRail();
  });

  // Ctrl+B or Cmd+B from lg, never while the person types (SD6).
  useEffect(() => {
    if (!wide) return;

    const onKeyDown = (event: KeyboardEvent) => onShortcut(event);

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [wide]);

  const toggleLabel = rail ? strings.expandMenu : strings.collapseMenu;

  const toggle = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={toggleLabel}
            aria-expanded={!rail}
            aria-controls={navigationId}
            onClick={toggleRail}
          />
        }
      >
        {rail ? (
          <ChevronsRight aria-hidden strokeWidth={1.75} className="size-5" />
        ) : (
          <ChevronsLeft aria-hidden strokeWidth={1.75} className="size-5" />
        )}
      </TooltipTrigger>
      <TooltipContent side="right">
        {toggleLabel}
        <Kbd>{strings.menuShortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );

  // React's pattern for state that follows a prop: adjust it during render.
  if (shownPath !== props.currentPath) {
    if (!isAskPath(shownPath)) setAskRail(true);

    setShownPath(props.currentPath);
    setDrawerOpen(false);
  }

  // Not on the first render, so a document load keeps the browser's own scroll.
  useEffect(() => {
    if (scrolledPath.current === props.currentPath) return;

    scrolledPath.current = props.currentPath;
    content.current?.scrollTo({ top: 0 });
  }, [props.currentPath]);

  const active = activeHref(props.navigation, props.currentPath);

  // Ask is the agent's own page, so it gets no panel and no Agent button (FR7).
  const agentOn = props.agentPanel !== undefined && !onAsk;

  const shellContext = {
    chrome: props.chrome,
    backTo: strings.backTo,
    linkComponent: props.linkComponent,
    agentPanel: agentOn,
  };

  const title =
    props.title ??
    shellLinks(props.navigation).find((link) => link.href === active)?.label ??
    (props.currentPath === props.menu.accountHref
      ? strings.account
      : undefined) ??
    (onAsk ? strings.ask : undefined) ??
    (props.chrome === "admin" ? strings.adminPortal : strings.workspace);

  return (
    // A docked chat is a fixed 400 px column, so the page makes room for it; a page with its own
    // chat hides the shell's chat button (Section 7 redesign, choice 2).
    <div
      data-shell=""
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground xl:has-[[data-chat-docked]]:pe-100 [&:has([data-page-chat])_[data-shell-chat]]:hidden"
    >
      <OfflineBar message={strings.offline} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Flush, full height, one border on its right (I19). */}
        <aside
          id={navigationId}
          aria-label={strings.navigation}
          data-shell-rail={rail ? "" : undefined}
          className={`hidden shrink-0 flex-col border-e border-border bg-muted motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out lg:flex ${rail ? "w-15" : "w-60"}`}
        >
          <Panel {...props} rail={rail} toggle={toggle} />
        </aside>
        {/* A child page brings its own top bar with a back link (design review 2.1), so the
            menu bar steps aside. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col [&:has([data-page-top-bar])>[data-shell-top-bar]]:hidden">
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
            {agentOn ? <AgentButton /> : null}
          </header>
          {/* Focusable, so a keyboard scrolls a page that holds no control of its own (6wz1.70).
              A group, not a region: a named region is a landmark, and the page's <main> must not
              sit inside one. The ring is inset, because the area fills the viewport. */}
          <div
            ref={content}
            data-shell-content=""
            role="group"
            aria-label={strings.pageContent}
            tabIndex={0}
            // The bottom space keeps the last row clear of the 48 px chat button, and of the
            // phone's action bar under it (design review 2.2). A page whose <main> carries
            // `data-page-fill` (a chat page, which hides the chat button) fills the height instead,
            // so its own parts scroll and its composer stays at the bottom (agent-native rule 1).
            className={`min-h-0 flex-1 overflow-auto px-4 pt-4 pb-28 md:px-6 lg:px-8 lg:pt-2 has-[[data-shell-bottom-bar]]:max-md:pb-32 has-[[data-page-fill]]:flex has-[[data-page-fill]]:flex-col has-[[data-page-fill]]:pb-4 ${focusRing} focus-visible:ring-inset`}
          >
            <ShellContext.Provider value={shellContext}>
              {props.children}
            </ShellContext.Provider>
          </div>
        </div>
        {/* The last item of the row: from 1280 px the open panel narrows the page (AG11). */}
        {props.agentPanel === undefined ? null : (
          <ShellContext.Provider value={shellContext}>
            {props.agentPanel}
          </ShellContext.Provider>
        )}
      </div>
      {props.chat === undefined ? null : (
        <div data-shell-chat="">{props.chat}</div>
      )}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          // 5/6 is the scale value nearest the design's 84vw; the lint refuses arbitrary widths.
          className="max-w-80 data-[side=left]:w-5/6"
          // Focus opens on the current page's entry, else on Close; never on the user footer.
          initialFocus={() =>
            drawer.current?.querySelector<HTMLElement>(
              '[aria-current="page"]'
            ) ?? closeButton.current
          }
        >
          <SheetTitle className="sr-only">{strings.navigation}</SheetTitle>
          {/* A tap on the current page's row changes no path, and a document load used to close
              the drawer, so any link inside closes it. */}
          {/* The aside's gray panel, so the current entry's white row shows as a fill. */}
          <div
            ref={drawer}
            data-shell-drawer=""
            className="flex min-h-0 flex-1 flex-col bg-muted"
            onClick={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("a") !== null
              )
                setDrawerOpen(false);
            }}
          >
            <div className="flex justify-end px-2 pt-2">
              <button
                ref={closeButton}
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

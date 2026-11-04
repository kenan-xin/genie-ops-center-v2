"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  focusRing,
  StickyActionBar,
} from "@genie/ui";
import { ChevronLeft } from "lucide-react";
import { use, type ReactNode } from "react";

import { PageTrailContext } from "./page-trail.tsx";
import { ShellContext } from "./shell-context.ts";
import { linkFor } from "./shell-link.ts";

/**
 * The trail of a page that sits under a list (tokens.md, Breadcrumbs): the route's parent and the
 * record's label. Core renders it, so a page or a module passes data only.
 */
export type PageBreadcrumb = {
  readonly parent: { readonly label: string; readonly href: string };
  /** The record's label; absent while the record loads. */
  readonly current?: string | undefined;
};

export type PageHeaderProps = {
  readonly title: string;
  readonly description?: string;
  /** A short line under the title, for example the customer and the issue date. Every width. */
  readonly meta?: ReactNode;
  /** The page's primary action; below `md` it moves to the bottom bar. */
  readonly actions?: ReactNode;
  /** Other actions, such as "Open the PDF"; they stay in the header at every width, unless `compactBelowLg`. */
  readonly secondaryActions?: ReactNode;
  /**
   * Below `lg` the header shows only the title (inside a shell, in the top bar): the page shows its
   * meta line and secondary actions in its own place, as the document desk's sheet does.
   * shortcut: `actions` with this show nowhere from `md` to `lg`; give the page a place for them
   * before a caller passes both.
   */
  readonly compactBelowLg?: boolean;
  readonly bottomBar?: ReactNode;
  /** Only on a page under a list; a top-level page passes none. */
  readonly breadcrumb?: PageBreadcrumb;
};

/**
 * A child page's own top bar below `lg` (design review 2.1): a back link to the parent and the
 * record's name. It stays at the top of the content, and the shell hides its menu bar beside it.
 * The name is for the eye; the page's `<h1>` stays for a screen reader.
 */
function PageTopBar(props: {
  readonly crumb: PageBreadcrumb;
  readonly name: string;
  readonly backTo: string;
  readonly Anchor: ReturnType<typeof linkFor>;
}) {
  const { crumb, Anchor } = props;

  return (
    <div
      data-page-top-bar=""
      // `-top-4`: a sticky box stops at the scroll area's padding edge, and the content pads 16 px.
      className="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 flex h-13.5 items-center gap-1 border-b border-border bg-background px-1 md:-mx-6 lg:hidden"
    >
      <Anchor
        href={crumb.parent.href}
        aria-label={props.backTo.replace("{page}", crumb.parent.label)}
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-border/60 ${focusRing}`}
      >
        <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-5" />
      </Anchor>
      <p
        aria-hidden="true"
        title={props.name}
        className="min-w-0 flex-1 truncate text-base font-semibold"
      >
        {props.name}
      </p>
    </div>
  );
}

/** The trail from 1024 px; below it the page top bar links back. */
function Trail(props: {
  readonly crumb: PageBreadcrumb;
  readonly Anchor: ReturnType<typeof linkFor>;
  readonly inShell: boolean;
}) {
  const { crumb, Anchor } = props;

  return (
    <>
      <Breadcrumb className={`mb-1 ${props.inShell ? "max-lg:hidden" : ""}`}>
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="shrink-0">
            <BreadcrumbLink render={<Anchor href={crumb.parent.href} />}>
              {crumb.parent.label}
            </BreadcrumbLink>
          </BreadcrumbItem>
          {crumb.current === undefined ? null : (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage title={crumb.current}>
                  {crumb.current}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}

/**
 * The page header slot (R-37, R-40) a page renders inside its own `<main>`. Inside a shell the top
 * bar shows the title below `lg`, and below `md` the actions move into a fixed bottom bar.
 */
export function PageHeader(props: PageHeaderProps) {
  const shell = use(ShellContext);
  const inShell = shell !== null;
  // A module page passes none: core gives it the trail of its route (R-1a).
  const crumb = props.breadcrumb ?? use(PageTrailContext);
  const hideBelowLg = inShell ? "max-lg:sr-only" : "";
  const bar = props.bottomBar ?? props.actions;

  const Anchor =
    crumb === undefined
      ? undefined
      : linkFor(crumb.parent.href, shell?.linkComponent);

  const compact = props.compactBelowLg === true;
  const hiddenIfCompact = compact ? "max-lg:hidden" : "";

  const showsBelowLg =
    !compact &&
    (props.meta !== undefined || props.secondaryActions !== undefined);

  // Below the width where the header shows nothing, take it out of the flow so a page's gap does not
  // leave an empty band under the top bar.
  const emptyBelow =
    !inShell || showsBelowLg
      ? ""
      : props.actions === undefined
        ? "max-lg:sr-only"
        : "max-md:sr-only";

  // Below `md` the side holds only hidden parts unless secondary actions show.
  const sideBelowMd =
    props.secondaryActions === undefined ? "max-md:hidden" : "";

  return (
    <>
      {shell !== null && crumb !== undefined && Anchor !== undefined ? (
        <PageTopBar
          crumb={crumb}
          backTo={shell.backTo}
          name={crumb.current ?? props.title}
          Anchor={Anchor}
        />
      ) : null}
      <header
        data-shell-page-header=""
        className={`mb-6 flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 ${emptyBelow}`}
      >
        <div className="max-w-full min-w-0">
          {crumb === undefined || Anchor === undefined ? null : (
            <Trail crumb={crumb} Anchor={Anchor} inShell={inShell} />
          )}
          <h1 className={`text-xl font-bold ${hideBelowLg}`}>{props.title}</h1>
          {props.description === undefined ? null : (
            <p className={`text-sm text-muted-foreground ${hideBelowLg}`}>
              {props.description}
            </p>
          )}
          {props.meta === undefined ? null : (
            <p
              className={`mt-1 text-sm text-muted-foreground ${hiddenIfCompact}`}
            >
              {props.meta}
            </p>
          )}
        </div>
        {inShell ? (
          <div
            className={`flex flex-wrap items-center gap-2 ${sideBelowMd} ${hiddenIfCompact}`}
          >
            <div
              data-shell-slot="search"
              aria-hidden="true"
              className="hidden lg:block"
            />
            {props.secondaryActions}
            {props.actions === undefined ? null : (
              <div className="hidden items-center gap-2 md:flex">
                {props.actions}
              </div>
            )}
          </div>
        ) : props.actions === undefined &&
          props.secondaryActions === undefined ? null : (
          <div
            className={`flex flex-wrap items-center gap-2 ${hiddenIfCompact}`}
          >
            {props.secondaryActions}
            {props.actions}
          </div>
        )}
      </header>
      {inShell && bar !== undefined ? (
        <StickyActionBar>{bar}</StickyActionBar>
      ) : null}
    </>
  );
}

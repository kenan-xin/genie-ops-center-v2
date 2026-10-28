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
  readonly actions?: ReactNode;
  readonly bottomBar?: ReactNode;
  /** Only on a page under a list; a top-level page passes none. */
  readonly breadcrumb?: PageBreadcrumb;
};

/** The trail from 768 px, and one back link to the parent below it. */
function Trail(props: {
  readonly crumb: PageBreadcrumb;
  readonly Anchor: ReturnType<typeof linkFor>;
}) {
  const { crumb, Anchor } = props;

  return (
    <>
      <Breadcrumb className="mb-1 max-md:hidden">
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
      <Anchor
        href={crumb.parent.href}
        className={`-ml-1 inline-flex min-h-11 items-center gap-1 rounded-sm pr-2 text-sm text-muted-foreground hover:text-foreground md:hidden ${focusRing}`}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {crumb.parent.label}
      </Anchor>
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
  const crumb = props.breadcrumb;
  const hideBelowLg = inShell ? "max-lg:sr-only" : "";
  const bar = props.bottomBar ?? props.actions;

  // Below the width where the header shows nothing, take it out of the flow so a page's gap does not
  // leave an empty band under the top bar. A trail always shows, so its header stays.
  const emptyBelow =
    !inShell || crumb !== undefined
      ? ""
      : props.actions === undefined
        ? "max-lg:sr-only"
        : "max-md:sr-only";

  return (
    <>
      <header
        data-shell-page-header=""
        className={`mb-6 flex items-center justify-between gap-4 ${emptyBelow}`}
      >
        <div className="min-w-0">
          {crumb === undefined ? null : (
            <Trail
              crumb={crumb}
              Anchor={linkFor(crumb.parent.href, shell?.linkComponent)}
            />
          )}
          <h1 className={`text-xl font-bold ${hideBelowLg}`}>{props.title}</h1>
          {props.description === undefined ? null : (
            <p className={`text-sm text-muted-foreground ${hideBelowLg}`}>
              {props.description}
            </p>
          )}
        </div>
        {inShell ? (
          <div className="flex items-center gap-2">
            <div
              data-shell-slot="search"
              aria-hidden="true"
              className="hidden lg:block"
            />
            {props.actions === undefined ? null : (
              <div className="hidden items-center gap-2 md:flex">
                {props.actions}
              </div>
            )}
          </div>
        ) : props.actions === undefined ? null : (
          <div className="flex items-center gap-2">{props.actions}</div>
        )}
      </header>
      {inShell && bar !== undefined ? (
        <StickyActionBar>{bar}</StickyActionBar>
      ) : null}
    </>
  );
}

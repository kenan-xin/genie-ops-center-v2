"use client";

import { use, type ReactNode } from "react";

import { ShellContext } from "./shell-context.ts";

export type PageHeaderProps = {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly bottomBar?: ReactNode;
};

/**
 * The page header slot (R-37, R-40) a page renders inside its own `<main>`. Inside a shell the top
 * bar shows the title below `lg`, and below `md` the actions move into a fixed bottom bar.
 */
export function PageHeader(props: PageHeaderProps) {
  const inShell = use(ShellContext) !== null;
  const hideBelowLg = inShell ? "max-lg:sr-only" : "";
  const bar = props.bottomBar ?? props.actions;

  // Below the width where the header shows nothing, take it out of the flow so a page's gap does not
  // leave an empty band under the top bar.
  const emptyBelow = !inShell
    ? ""
    : props.actions === undefined
      ? "max-lg:sr-only"
      : "max-md:sr-only";

  return (
    <>
      <header
        data-shell-page-header=""
        className={`flex items-center justify-between gap-4 ${emptyBelow}`}
      >
        <div className="min-w-0">
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
        <div
          data-shell-bottom-bar=""
          className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-end gap-2 border-t bg-background px-4 py-3 md:hidden"
        >
          {bar}
        </div>
      ) : null}
    </>
  );
}

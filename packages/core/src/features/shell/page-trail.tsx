"use client";

import { createContext, type ReactNode } from "react";

import type { PageBreadcrumb } from "./page-header.tsx";

/** The trail of the route around a page, which core's route check builds (R-1a). */
export const PageTrailContext = createContext<PageBreadcrumb | undefined>(
  undefined
);

/** Gives the PageHeader inside it the trail of its route. */
export function PageTrailProvider(props: {
  readonly value: PageBreadcrumb | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <PageTrailContext value={props.value}>{props.children}</PageTrailContext>
  );
}

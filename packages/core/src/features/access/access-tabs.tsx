"use client";

import { focusRing } from "@genie/ui";
import type { ReactNode } from "react";

import { PageLink } from "../shell/page-link.tsx";

const TABS = [
  { id: "grants", label: "Grants", href: "/admin/access" },
  { id: "overview", label: "Overview", href: "/admin/access/overview" },
] as const;

/**
 * The two tabs of Access. Each tab is its own route (O9), so the bar is a `nav` of links, not a
 * panel switch.
 */
export function AccessTabs(props: {
  readonly current: "grants" | "overview";
}): ReactNode {
  return (
    <nav aria-label="Access" className="mb-5 flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const current = tab.id === props.current;

        return (
          <PageLink
            key={tab.id}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={`-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm ${focusRing} ${current ? "border-primary font-semibold text-primary dark:text-brand-on-dark" : "border-transparent font-medium text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </PageLink>
        );
      })}
    </nav>
  );
}

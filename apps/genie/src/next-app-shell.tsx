"use client";

import {
  AppShell,
  RouteFocus,
  type AppShellProps,
  type ShellLinkComponent,
} from "@genie/core/features/shell";
import linkModule from "next/link.js";
import { usePathname } from "next/navigation.js";

// NodeNext types this CommonJS default import as the whole module, while Next's bundler can hand
// over the component itself, so the link is taken from whichever shape arrives.
const Link: ShellLinkComponent =
  "default" in linkModule ? linkModule.default : linkModule;

/**
 * The two places the core shell meets Next's router (NAV-1). Core imports nothing from `next/*`,
 * and a component cannot pass from a server component as a prop, so this client file passes them.
 */
export function NextAppShell(props: Omit<AppShellProps, "linkComponent">) {
  return <AppShell {...props} linkComponent={Link} />;
}

/** The router's pathname has no search, so a filter or a section change keeps the person's focus. */
export function NextRouteFocus() {
  return <RouteFocus path={usePathname()} />;
}

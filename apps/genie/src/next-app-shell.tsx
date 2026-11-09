"use client";

import { AgentPanelHost } from "@genie/core/features/agent/panel";
import {
  AppShell,
  RouteFocus,
  type AppShellProps,
  type ShellLinkComponent,
} from "@genie/core/features/shell";
import linkModule from "next/link.js";
import { usePathname, useRouter } from "next/navigation.js";
import type { ComponentProps } from "react";

// NodeNext types this CommonJS default import as the whole module, while Next's bundler can hand
// over the component itself, so the link is taken from whichever shape arrives.
const Link: ShellLinkComponent =
  "default" in linkModule ? linkModule.default : linkModule;

/**
 * The two places the core shell meets Next's router (NAV-1). Core imports nothing from `next/*`,
 * and a component cannot pass from a server component as a prop, so this client file passes them.
 * The path comes from the router, because a layout's shell stays mounted across navigations.
 */
export function NextAppShell(
  props: Omit<AppShellProps, "linkComponent" | "currentPath">
) {
  return (
    <AppShell {...props} currentPath={usePathname()} linkComponent={Link} />
  );
}

/**
 * The agent panel with the router's path and push, so on a surface's record page it is that
 * surface's agent, and a handoff opens the page that builds (S7-41).
 */
export function NextAgentPanelHost(
  props: Omit<ComponentProps<typeof AgentPanelHost>, "path" | "navigate">
) {
  const router = useRouter();

  return (
    <AgentPanelHost
      {...props}
      path={usePathname()}
      navigate={(href) => router.push(href)}
    />
  );
}

/** The router's pathname has no search, so a filter or a section change keeps the person's focus. */
export function NextRouteFocus() {
  return <RouteFocus path={usePathname()} />;
}

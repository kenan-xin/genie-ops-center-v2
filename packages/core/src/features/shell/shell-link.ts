import type { ShellLinkComponent } from "./types.ts";

/**
 * Whether an href is a page of this app that a client router may open (NAV-1). A protocol-relative
 * or backslash href leaves the origin, and a viewer loads a document so that its own policy is
 * installed before its frame renders (R-42).
 */
export function isClientRoute(href: string): boolean {
  return (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.startsWith("/\\") &&
    !href.startsWith("/viewer/")
  );
}

/** The element an internal shell link renders: the host's link for a client route, else `a`. */
export function linkFor(
  href: string,
  linkComponent: ShellLinkComponent | undefined
): ShellLinkComponent | "a" {
  return linkComponent !== undefined && isClientRoute(href)
    ? linkComponent
    : "a";
}

"use client";

import { use, type ComponentProps, type ReactNode } from "react";

import { ShellContext } from "./shell-context.ts";
import { linkFor } from "./shell-link.ts";
import type { ShellLinkComponent } from "./types.ts";

export type PageLinkProps = ComponentProps<ShellLinkComponent>;

/** A module page's link to another page: the host's router link inside a shell, else `a`. */
export function PageLink(props: PageLinkProps): ReactNode {
  const shell = use(ShellContext);
  const Anchor = linkFor(props.href, shell?.linkComponent);

  return <Anchor {...props} />;
}

"use client";

import { createContext } from "react";

import type { ShellChrome, ShellLinkComponent } from "./types.ts";

/** Set only by AppShell. `null` means the page renders outside a shell. */
export const ShellContext = createContext<{
  readonly chrome: ShellChrome;
  readonly linkComponent?: ShellLinkComponent | undefined;
  /** `ShellStrings.backTo`, for the page header's phone back link. */
  readonly backTo: string;
} | null>(null);

"use client";

import { createContext, type ReactNode } from "react";

import type { ShellChrome, ShellLinkComponent } from "./types.ts";

/** Set only by AppShell. `null` means the page renders outside a shell. */
export const ShellContext = createContext<{
  readonly chrome: ShellChrome;
  readonly linkComponent?: ShellLinkComponent | undefined;
  /** `ShellStrings.backTo`, for the page header's phone back link. */
  readonly backTo: string;
  /** The app passed an agent panel host, and the page is not Ask: the Agent button shows. */
  readonly agentPanel: boolean;
  /**
   * The shell's phone menu button, for a top-level page that brings its own top bar below `lg`, so
   * the page keeps one bar (Ask, czjw.200). Undefined outside AppShell.
   */
  readonly menuButton?: ReactNode;
} | null>(null);

"use client";

import { createContext } from "react";

import type { ShellChrome } from "./types.ts";

/** Set only by AppShell. `null` means the page renders outside a shell. */
export const ShellContext = createContext<{
  readonly chrome: ShellChrome;
} | null>(null);

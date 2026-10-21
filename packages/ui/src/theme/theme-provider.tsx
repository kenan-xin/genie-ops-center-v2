"use client";

import type { ReactNode } from "react";

import { themeTokens, type ThemeName } from "./tokens.ts";

export type ThemeProviderProps = {
  readonly theme: ThemeName;
  readonly children: ReactNode;
};

/**
 * The browser-safe theme surface a story renders against.
 *
 * It carries no product feature. It applies the fixed token pair for one theme,
 * so the host's decorator and any story that composes it render on the same
 * surface. Because the host wires this once, every story proves the tokens it
 * reads.
 */
export function ThemeProvider(props: ThemeProviderProps) {
  const token = themeTokens[props.theme];

  return (
    <div
      data-theme={props.theme}
      style={{ backgroundColor: token.surface, color: token.foreground }}
    >
      {props.children}
    </div>
  );
}

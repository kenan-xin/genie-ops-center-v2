"use client";

import type { ReactNode } from "react";

import type { ThemeName } from "./tokens.ts";

export type ThemeProviderProps = {
  readonly theme: ThemeName;
  readonly children: ReactNode;
};

/**
 * The Storybook-only theme decorator (D3-4).
 *
 * The application puts the theme on `<html data-theme>`. A story has no such
 * document, so this sets `data-theme` on the story root instead: the fixed
 * layer's variables and every `dark:` class then apply inside the story.
 */
export function ThemeProvider(props: ThemeProviderProps) {
  return (
    <div data-theme={props.theme} className="bg-background text-foreground">
      {props.children}
    </div>
  );
}

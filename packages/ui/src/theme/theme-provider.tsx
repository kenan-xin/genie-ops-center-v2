"use client";

import { useEffect, type ReactNode } from "react";

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
 * layer's variables and every `dark:` class then apply inside the story. It
 * also sets it on `<html>`, so a popup or dialog portaled out of the story root
 * renders in the same theme, as it does in the application.
 */
export function ThemeProvider(props: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset["theme"];

    root.dataset["theme"] = props.theme;

    return () => {
      if (before === undefined) delete root.dataset["theme"];
      else root.dataset["theme"] = before;
    };
  }, [props.theme]);

  return (
    <div data-theme={props.theme} className="bg-background text-foreground">
      {props.children}
    </div>
  );
}

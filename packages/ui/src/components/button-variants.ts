// No "use client": server components (the app home page) call this too.
import { cva } from "class-variance-authority";

import { fieldHeight } from "../theme/tokens.ts";

// A 32 px control owns an invisible 44 px hit area (tokens.md, "Buttons").
const hitArea = "relative after:absolute after:-inset-1.5";

// Each variant names its own border color, because a caller that builds a link from this class list
// gets no tailwind-merge, and a base `border-transparent` would then hide the secondary border.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap motion-safe:transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        "primary":
          "border-transparent bg-primary text-primary-foreground not-disabled:not-aria-disabled:hover:bg-primary/94 not-disabled:not-aria-disabled:active:bg-primary/80",
        "secondary":
          "border-input bg-card text-foreground not-disabled:not-aria-disabled:hover:bg-muted",
        // An empty list filter in the bar: the gray-300 control border, because its text names it (czjw.102).
        "filter":
          "border-control bg-card text-foreground not-disabled:not-aria-disabled:hover:bg-muted",
        // A filter control with a set value: tinted and semibold, where an empty one stays
        // secondary (Spec 7 R-37a, czjw.65).
        "filter-set":
          "border-primary/40 bg-primary/8 font-semibold text-primary not-disabled:not-aria-disabled:hover:bg-primary/14 dark:text-brand-on-dark",
        "danger":
          "border-transparent bg-destructive text-white not-disabled:not-aria-disabled:hover:bg-destructive/94 not-disabled:not-aria-disabled:active:bg-destructive/80",
        // A destructive action beside others: the secondary outline with red text (DESIGN.md "Danger").
        "danger-outline":
          "border-input bg-card text-destructive not-disabled:not-aria-disabled:hover:bg-muted dark:text-destructive-on-dark",
        "ghost":
          "border-transparent text-foreground not-disabled:not-aria-disabled:hover:bg-muted",
        "link":
          "border-transparent text-primary underline-offset-4 not-disabled:not-aria-disabled:hover:underline dark:text-brand-on-dark",
      },
      size: {
        "sm": `h-8 min-h-8 px-3 ${hitArea}`,
        "md": "h-10 min-h-10 px-4",
        "lg": "h-11 min-h-11 px-5",
        // A button that sits among fields, as a list filter control: the field height (R-37a).
        "filter": `${fieldHeight} px-3`,
        "icon": "size-11 lg:size-10",
        "icon-sm": `size-8 ${hitArea}`,
        // The 36 px Send and Stop of the agent composer (czjw.120 item 10).
        "icon-send": `size-9 ${hitArea}`,
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export { buttonVariants };

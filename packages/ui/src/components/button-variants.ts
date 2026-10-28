// No "use client": server components (the app home page) call this too.
import { cva } from "class-variance-authority";

// A 32 px control owns an invisible 44 px hit area (tokens.md, "Buttons").
const hitArea = "relative after:absolute after:-inset-1.5";

// Each variant names its own border color, because a caller that builds a link from this class list
// gets no tailwind-merge, and a base `border-transparent` would then hide the secondary border.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap motion-safe:transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground not-disabled:not-aria-disabled:hover:bg-primary/90 not-disabled:not-aria-disabled:active:bg-primary/80",
        secondary:
          "border-input bg-card text-foreground not-disabled:not-aria-disabled:hover:bg-muted",
        danger:
          "border-transparent bg-destructive text-white not-disabled:not-aria-disabled:hover:bg-destructive/90 not-disabled:not-aria-disabled:active:bg-destructive/80",
        ghost:
          "border-transparent text-foreground not-disabled:not-aria-disabled:hover:bg-muted",
        link: "border-transparent text-primary underline-offset-4 not-disabled:not-aria-disabled:hover:underline dark:text-brand-on-dark",
      },
      size: {
        "sm": `h-8 min-h-8 px-3 ${hitArea}`,
        "md": "h-10 min-h-10 px-4",
        "lg": "h-11 min-h-11 px-5",
        "icon": "size-11 lg:size-10",
        "icon-sm": `size-8 ${hitArea}`,
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export { buttonVariants };

/**
 * The typed fixed token layer of `docs/design/design-system/tokens.md` (D3-3).
 *
 * `tokens.css` beside it writes the same values as CSS variables, and a test
 * compares the two. Nothing here derives a value from a tenant: the
 * per-request branding layer overrides only the primary pair, the root size and
 * the face, so this package needs no color computation (the no-ramp rule).
 */
export type ThemeName = "light" | "dark";

export type ColorRole =
  | "background"
  | "foreground"
  | "card"
  | "muted"
  | "muted-foreground"
  | "border"
  | "input"
  | "ring"
  | "primary"
  | "primary-foreground"
  | "destructive"
  | "brand-on-dark";

const lightRoles = {
  "background": "#ffffff",
  "foreground": "#111827",
  "card": "#ffffff",
  "muted": "#f9fafb",
  "muted-foreground": "#4b5563",
  "border": "#e5e7eb",
  "input": "#6b7280",
  "ring": "var(--primary)",
  "primary": "#2563eb",
  "primary-foreground": "#ffffff",
  "destructive": "#dc2626",
  "brand-on-dark": "#60a5fa",
} as const satisfies Record<ColorRole, string>;

export const colorRoles: Readonly<
  Record<ThemeName, Readonly<Record<ColorRole, string>>>
> = {
  light: lightRoles,
  // tokens.md: the roles it does not list for dark repeat the light value.
  dark: {
    ...lightRoles,
    "background": "#030712",
    "foreground": "#f3f4f6",
    "card": "#111827",
    "muted": "#111827",
    "muted-foreground": "#9ca3af",
    "border": "#1f2937",
    "ring": "var(--brand-on-dark)",
  },
};

export type TypeRole = {
  readonly size: string;
  readonly phoneSize?: string;
  readonly weight: string;
};

export const typeScale: Readonly<
  Record<
    "display" | "title" | "heading" | "body" | "secondary" | "caption",
    TypeRole
  >
> = {
  display: { size: "text-2xl", phoneSize: "text-xl", weight: "font-bold" },
  title: { size: "text-xl", phoneSize: "text-lg", weight: "font-bold" },
  heading: { size: "text-lg", weight: "font-semibold" },
  // tokens.md also allows font-medium for nav rows.
  body: { size: "text-base", weight: "font-normal" },
  secondary: { size: "text-sm", weight: "font-normal" },
  // tokens.md also allows font-semibold for pills.
  caption: { size: "text-xs", weight: "font-medium" },
};

export const spacingPx = 4;

export const controlHeightsPx = { sm: 32, md: 40, lg: 44 } as const;

export const defaultControlHeight = "md";

export const radiusPx = { menu: 6, control: 8, card: 12 } as const;

export const motion = {
  minDurationMs: 150,
  maxDurationMs: 220,
  durationMs: 150,
  easing: "cubic-bezier(0, 0, 0.2, 1)",
} as const;

export const fontSizePresetsPx = {
  compact: 14,
  default: 15,
  large: 16,
} as const;

export type FontSizePreset = keyof typeof fontSizePresetsPx;

export const defaultFontSizePreset: FontSizePreset = "default";

export const approvedFonts = ["plus-jakarta-sans"] as const;

export type FontKey = (typeof approvedFonts)[number];

export const defaultFont: FontKey = "plus-jakarta-sans";

export const monoFont = "jetbrains-mono";

/** R-8: the one focus ring, colored only through --ring. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

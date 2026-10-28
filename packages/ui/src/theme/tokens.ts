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
  | "brand-on-dark"
  | "destructive-on-dark";

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
  "destructive-on-dark": "#f87171",
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

/**
 * The event categories of the State-vs-Label Rule exception in `DESIGN.md`, with the fixed
 * tones of tokens.md, "Category colors". A tone never derives from the tenant color, and each
 * one sits clear of the status colors and the default primary blue, so a category never reads
 * as a status. The chip keeps its text label, so the color is never the only code.
 */
export type CategoryTone =
  | "session"
  | "people"
  | "groups"
  | "access"
  | "settings"
  | "modules"
  | "module-event";

export type CategoryTonePair = {
  readonly background: string;
  readonly text: string;
};

export const categoryColors: Readonly<
  Record<CategoryTone, Readonly<Record<ThemeName, CategoryTonePair>>>
> = {
  "session": {
    light: { background: "#ecfeff", text: "#155e75" },
    dark: { background: "#083344", text: "#67e8f9" },
  },
  "people": {
    light: { background: "#f5f3ff", text: "#6d28d9" },
    dark: { background: "#2e1065", text: "#c4b5fd" },
  },
  "groups": {
    light: { background: "#fdf4ff", text: "#a21caf" },
    dark: { background: "#4a044e", text: "#f0abfc" },
  },
  "access": {
    light: { background: "#eef2ff", text: "#4338ca" },
    dark: { background: "#1e1b4b", text: "#a5b4fc" },
  },
  "settings": {
    light: { background: "#faf5ff", text: "#7e22ce" },
    dark: { background: "#3b0764", text: "#d8b4fe" },
  },
  "modules": {
    light: { background: "#f0f9ff", text: "#0369a1" },
    dark: { background: "#082f49", text: "#7dd3fc" },
  },
  "module-event": {
    light: { background: "#f1f5f9", text: "#334155" },
    dark: { background: "#1e293b", text: "#cbd5e1" },
  },
};

/** Every tone's chip classes, so no component names a category color itself. */
export const categoryChipClasses: Readonly<Record<CategoryTone, string>> = {
  "session": "bg-category-session-bg text-category-session-fg",
  "people": "bg-category-people-bg text-category-people-fg",
  "groups": "bg-category-groups-bg text-category-groups-fg",
  "access": "bg-category-access-bg text-category-access-fg",
  "settings": "bg-category-settings-bg text-category-settings-fg",
  "modules": "bg-category-modules-bg text-category-modules-fg",
  "module-event": "bg-category-module-event-bg text-category-module-event-fg",
};

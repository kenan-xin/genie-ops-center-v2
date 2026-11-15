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
  | "tile"
  | "hover"
  | "success"
  | "placeholder"
  | "border"
  | "input"
  | "control"
  | "control-foreground"
  | "ring"
  | "primary"
  | "primary-foreground"
  | "destructive"
  | "brand-on-dark"
  | "destructive-on-dark"
  | "destructive-text";

const lightRoles = {
  "background": "#ffffff",
  "foreground": "#111827",
  "card": "#ffffff",
  "muted": "#f9fafb",
  "muted-foreground": "#4b5563",
  // DESIGN.md "Tile": a neutral gray tile, such as the person's chat message (czjw.120).
  "tile": "#f3f4f6",
  // DESIGN.md "Hover": a see-through state layer, visible on white, the gray-50 panel and a card.
  "hover": "rgb(17 24 39 / 0.06)",
  // tokens.md "Status is semantic": emerald success, such as the done mark of the steps pill.
  "success": "#047857",
  // czjw.65: lighter than muted text, so a hint never reads as an entered value.
  "placeholder": "#6b7280",
  "border": "#e5e7eb",
  "input": "#6b7280",
  // DESIGN.md "Control border": a button-like control that its text names, such as a list filter.
  "control": "#d1d5db",
  // DESIGN.md "Control text" (6wz1.99): the semibold label of a secondary button.
  "control-foreground": "#1f2937",
  "ring": "var(--primary)",
  "primary": "#2563eb",
  "primary-foreground": "#ffffff",
  "destructive": "#dc2626",
  "brand-on-dark": "#60a5fa",
  "destructive-on-dark": "#f87171",
  // tokens.md "Button": the danger outline label, readable on the hover layer.
  "destructive-text": "#b91c1c",
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
    "tile": "#1f2937",
    "hover": "rgb(255 255 255 / 0.08)",
    "success": "#6ee7b7",
    "destructive-text": "#f87171",
    "placeholder": "#9ca3af",
    "border": "#1f2937",
    "control": "#374151",
    "control-foreground": "#f3f4f6",
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

/**
 * 6wz1.114: one height scale for buttons and fields. md is 36 px from `lg` and 40 px under it,
 * sm (32 px) is for dense places only, lg is 44 px.
 */
export const controlHeightsPx = {
  sm: 32,
  md: { desktop: 36, phone: 40 },
  lg: 44,
} as const;

/** 6wz1.114: the touch area every control reaches under `lg`, its box or its `::after`. */
export const touchAreaPx = 44;

/** 6wz1.114: the height classes of `controlHeightsPx`, border included. */
export const controlHeights = {
  sm: "h-8 min-h-8",
  md: "h-10 min-h-10 lg:h-9 lg:min-h-9",
  lg: "h-11 min-h-11",
} as const;

/** 6wz1.114: an icon-only control, a square of its control height. */
export const iconControlSizes = {
  sm: "size-8",
  md: "size-10 lg:size-9",
} as const;

/**
 * 6wz1.114: an invisible box that reaches 44 px around a smaller control, drawn under its own
 * content (`isolate`, `-z-10`), so a tap on a native field inside still reaches the field. It is
 * centered at 44 px minimum, not set by negative insets, because insets count from inside the
 * border and leave a bordered control 2 px short.
 */
export const touchAreas = {
  sm: "relative isolate after:absolute after:top-1/2 after:left-1/2 after:-z-10 after:size-full after:min-h-11 after:min-w-11 after:-translate-1/2",
  md: "relative isolate max-lg:after:absolute max-lg:after:top-1/2 max-lg:after:left-1/2 max-lg:after:-z-10 max-lg:after:size-full max-lg:after:min-h-11 max-lg:after:min-w-11 max-lg:after:-translate-1/2",
} as const;

/**
 * 6wz1.114: for a control flush beside its neighbors (a tab, a joined button): up and down only.
 * Centered at 44 px minimum for the reason of `touchAreas` (P06-21).
 */
export const touchAreaY =
  "relative isolate max-lg:before:absolute max-lg:before:inset-x-0 max-lg:before:top-1/2 max-lg:before:-z-10 max-lg:before:h-full max-lg:before:min-h-11 max-lg:before:-translate-y-1/2";

/** 6wz1.114: a stacked list row: 44 px under `lg`, where its own box is its touch area; md from `lg`. */
export const rowHeight = "min-h-11 lg:min-h-9";

/** 6wz1.114: the control inside an input group: its control height less the group's two 1 px borders. */
export const groupControlHeights = {
  sm: "h-7.5 min-h-7.5",
  md: "h-9.5 min-h-9.5 lg:h-8.5 lg:min-h-8.5",
  lg: "h-10.5 min-h-10.5",
} as const;

/** 6wz1.114: a field's text: 16 px under `lg` at every root preset, so iOS Safari does not zoom on focus. */
export const fieldText = "field-text lg:text-sm";

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

/**
 * The eight chart series slots of tokens.md, "Chart series colors" (the chart exception in
 * `DESIGN.md`). A chart takes them in order and never cycles, because the chart gate refuses a
 * ninth series. They never derive from the tenant color.
 */
export const chartColors: Readonly<Record<ThemeName, readonly string[]>> = {
  light: [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#6250d6",
    "#e34948",
  ],
  dark: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
  ],
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

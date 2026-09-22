/**
 * The Section 0 slice of the design system's fixed token layer.
 *
 * `docs/design/design-system/tokens.md` is the source of truth; this file is
 * its first implementation in `packages/ui`, where the design tree says tokens
 * belong. It holds only the surface pair every story renders against, in the
 * light and dark themes, because the full primitive catalogue is Section 3's.
 *
 * Nothing here derives a value from a tenant. The one customizable brand colour
 * stays the runtime Branding layer's, so this package needs no colour-space
 * computation (the fixed layer's no-ramp rule).
 */
export type ThemeName = "light" | "dark";

export type ThemeToken = {
  /** The surface a story renders on. */
  readonly surface: string;
  /** The readable foreground on that surface. */
  readonly foreground: string;
};

export const themeTokens: Readonly<Record<ThemeName, ThemeToken>> = {
  // gray-950 surface with gray-100 foreground, and white with gray-900, the
  // fixed layer's defaults.
  light: { surface: "#ffffff", foreground: "#111827" },
  dark: { surface: "#030712", foreground: "#f3f4f6" },
};

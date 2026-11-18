import type { SlideTheme, StoredTheme } from "../../contract.ts";

/** The blue brand `#2563EB` as `resolveTheme` answers it; `theme.test.ts` holds them equal. */
export const BLUE_THEME: SlideTheme = {
  companyName: "Genie Ops",
  fontFace: "Plus Jakarta Sans",
  background: "#FFFFFF",
  text: "#111827",
  secondaryText: "#4B5563",
  accent: "#2563EB",
  accentText: "#FFFFFF",
  panel: "#2563EB",
  panelText: "#FFFFFF",
  panelBody: "#FFFFFF",
  hairline: "#E2E3E5",
  rule: "#C4C5C9",
  neutral: "#888C93",
  ring: "#5585EF",
  layout: "solid",
  weight: "bold",
  logo: "light",
  dark: false,
};

/** The green brand `#047857` as `resolveTheme` answers it; `theme.test.ts` holds them equal. */
export const GREEN_THEME: SlideTheme = {
  companyName: "Genie Ops",
  fontFace: "Plus Jakarta Sans",
  background: "#FFFFFF",
  text: "#111827",
  secondaryText: "#4B5563",
  accent: "#047857",
  accentText: "#FFFFFF",
  panel: "#047857",
  panelText: "#FFFFFF",
  panelBody: "#FFFFFF",
  hairline: "#E2E3E5",
  rule: "#C4C5C9",
  neutral: "#888C93",
  ring: "#3B967C",
  layout: "solid",
  weight: "bold",
  logo: "light",
  dark: false,
};

/** The violet brand `#6D28D9` as `resolveTheme` answers it; `theme.test.ts` holds them equal. */
export const VIOLET_THEME: SlideTheme = {
  companyName: "Genie Ops",
  fontFace: "Plus Jakarta Sans",
  background: "#FFFFFF",
  text: "#111827",
  secondaryText: "#4B5563",
  accent: "#6D28D9",
  accentText: "#FFFFFF",
  panel: "#6D28D9",
  panelText: "#FFFFFF",
  panelBody: "#FFFFFF",
  hairline: "#E2E3E5",
  rule: "#C4C5C9",
  neutral: "#888C93",
  ring: "#8D57E1",
  layout: "solid",
  weight: "bold",
  logo: "light",
  dark: false,
};

/** The "dark and minimal" sample as a deck stores it. */
export const DARK_SAMPLE: StoredTheme = {
  background: "#030712",
  text: "#F3F4F6",
  secondaryText: "#9CA3AF",
  accent: "#60A5FA",
  weight: "regular",
  layout: "light",
  logo: "dark",
};

/** The blue brand under `DARK_SAMPLE`. */
export const DARK_THEME: SlideTheme = {
  companyName: "Genie Ops",
  fontFace: "Plus Jakarta Sans",
  background: "#030712",
  text: "#F3F4F6",
  secondaryText: "#9CA3AF",
  accent: "#60A5FA",
  accentText: "#111827",
  panel: "#3F424B",
  panelText: "#F3F4F6",
  panelBody: "#9CA3AF",
  hairline: "#20232D",
  rule: "#3F424B",
  neutral: "#7B7E84",
  ring: "#60A5FA",
  layout: "light",
  weight: "regular",
  logo: "dark",
  dark: true,
};

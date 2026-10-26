/**
 * The browser-safe Branding feature: the screen, its props, and the link rules the sign-in footer
 * shares with the screen. It imports no database, no registry and no environment value, so
 * Storybook and the application both render it.
 */
export {
  BrandingScreen,
  type BrandingScreenProps,
} from "./branding-screen.tsx";

export {
  httpUrl,
  supportContact,
  type SupportContact,
} from "../../lib/branding/support.ts";

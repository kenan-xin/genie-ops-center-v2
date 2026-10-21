import type { Config } from "tailwindcss";

/**
 * The shared Tailwind 4 preset. It carries structure only.
 * packages/ui owns every design token, so this file defines no colour, font, or spacing scale.
 * Defining one here would create a second token source and a config-to-ui dependency (R-7a).
 *
 * Tailwind 4 is CSS-first. Automatic source detection scans from the entry stylesheet.
 * A consumer loads this preset through the `presets` array of its own configuration file,
 * which anchors the `content` globs below at the consumer directory and adds them to
 * detection. An entry stylesheet can also load a configuration file through the
 * `@config` directive, which Tailwind 4 keeps as the supported legacy path.
 */
export const tailwindPreset: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

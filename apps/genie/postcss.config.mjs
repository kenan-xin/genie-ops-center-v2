/**
 * Tailwind 4 reaches the Next build through this plugin. Without it the
 * framework treats the stylesheet as plain CSS: `@import "tailwindcss"` is not
 * expanded and `@config` is reported as an unknown at-rule, so the shared
 * preset is never read in a production build however well a direct compile
 * behaves in a test.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

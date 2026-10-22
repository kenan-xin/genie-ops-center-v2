/**
 * Tailwind 4 reaches the Next build through this plugin. Without it the
 * framework treats the stylesheet as plain CSS: `@import "tailwindcss"` and
 * `@source` are not expanded, so a production build holds no utility however
 * well a direct compile behaves in a test.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

import type { Plugin } from "vite";

/**
 * Adds one Tailwind `@source` line per selected module to the host stylesheet.
 *
 * A static glob over every module would scan excluded modules too, and put
 * their class names into the selection's static output. The selection is only
 * known when `main.ts` runs, so the lines are added to the stylesheet text
 * before Tailwind compiles it. Both plugins run in the `pre` stage, in array
 * order, so this one must come first. `main.ts` builds the lines with
 * `moduleSourceLines` from `@genie/generators`, the same function that writes
 * the application's generated stylesheet, because only `main.ts` may import a
 * generator.
 */
export function moduleTailwindSources(options: {
  readonly stylesheet: string;
  readonly lines: string;
}): Plugin {
  const { lines } = options;

  return {
    name: "genie:module-tailwind-sources",
    enforce: "pre",
    transform(code, id) {
      // Vite adds a query such as `?direct` to a stylesheet id.
      const [path] = id.split("?");

      return path === options.stylesheet ? `${code}\n${lines}` : undefined;
    },
  };
}

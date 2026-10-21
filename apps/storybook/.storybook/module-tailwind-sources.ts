import { join } from "node:path";

import type { Plugin } from "vite";

/**
 * Adds one Tailwind `@source` line per selected module to the host stylesheet.
 *
 * A static glob over every module would scan excluded modules too, and put
 * their class names into the selection's static output. The selection is only
 * known when `main.ts` runs, so the lines are added to the stylesheet text
 * before Tailwind compiles it. Both plugins run in the `pre` stage, in array
 * order, so this one must come first.
 */
export function moduleSourceLines(
  workspaceRoot: string,
  moduleRoots: readonly string[]
): string {
  return moduleRoots
    .map(
      (root) => `@source ${JSON.stringify(join(workspaceRoot, root, "src"))};\n`
    )
    .join("");
}

export function moduleTailwindSources(options: {
  readonly stylesheet: string;
  readonly workspaceRoot: string;
  readonly moduleRoots: readonly string[];
}): Plugin {
  const lines = moduleSourceLines(options.workspaceRoot, options.moduleRoots);

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

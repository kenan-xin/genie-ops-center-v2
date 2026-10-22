import { join } from "node:path";

/**
 * One Tailwind `@source` line per selected module, so that an excluded module
 * adds no class to the compiled stylesheet (R-19c, D3-2).
 *
 * Both hosts call this: the application writes the lines into its generated
 * stylesheet, and Storybook adds them to its preview stylesheet. One function
 * keeps the two hosts from drifting. `base` is the path that each module root
 * is joined to: relative to the stylesheet for a written file, or absolute.
 */
export function moduleSourceLines(
  base: string,
  moduleRoots: readonly string[]
): string {
  return moduleRoots
    .map((root) => `@source ${JSON.stringify(join(base, root, "src"))};\n`)
    .join("");
}

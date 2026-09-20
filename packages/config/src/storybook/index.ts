/**
 * The shared Storybook configuration. The host in apps/storybook spreads it.
 *
 * This file stays build-safe. It imports no Storybook package, reads no
 * environment value, and starts no service. The host passes in the module roots
 * that the S0-01 selection resolver already resolved, so discovery never globs
 * every module and then hides the excluded ones.
 */
export type SharedStorybookInput = {
  /** Repository-relative roots of the selected module packages, in the supplied order. */
  readonly moduleRoots: readonly string[];
};

export type SharedStorybookConfig = {
  readonly framework: "@storybook/nextjs-vite";
  readonly stories: readonly string[];
  readonly addons: readonly string[];
};

const STORY_GLOB = "src/**/*.stories.@(ts|tsx|mdx)";

// The host configuration lives in apps/storybook/.storybook, three levels below
// the repository root, so every glob is written from there.
const FROM_HOST = "../../..";

export function sharedStorybookConfig(
  input: SharedStorybookInput
): SharedStorybookConfig {
  return {
    framework: "@storybook/nextjs-vite",
    stories: [
      `${FROM_HOST}/packages/ui/${STORY_GLOB}`,
      `${FROM_HOST}/packages/core/${STORY_GLOB}`,
      ...input.moduleRoots.map((root) => `${FROM_HOST}/${root}/${STORY_GLOB}`),
    ],
    addons: [
      "@storybook/addon-docs",
      "@storybook/addon-a11y",
      // Owns the test-storybook target and draws the in-user-interface test
      // panel. The command-line run reads the same project from vitest.config.ts.
      "@storybook/addon-vitest",
    ],
  };
}

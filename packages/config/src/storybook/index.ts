/**
 * The reserved shape of the shared Storybook configuration.
 *
 * S0-01 reserves this extension point and nothing else. S0-02 owns every Storybook
 * pin, the framework choice, the addon list, the preset body, and the Nx targets.
 * Keep this file free of a dependency on any Storybook package, so the workspace
 * builds before S0-02 lands.
 */
export type SharedStorybookConfig = {
  /** Story globs. S0-02 fills this from the module selection resolver. */
  readonly stories: readonly string[];
  /** Addon specifiers. S0-02 fills this. */
  readonly addons: readonly string[];
  /** The ticket that owns the body of this configuration. */
  readonly owner: "S0-02";
};

export const sharedStorybookConfig: SharedStorybookConfig = {
  stories: [],
  addons: [],
  owner: "S0-02",
};

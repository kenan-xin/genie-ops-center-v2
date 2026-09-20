import { describe, expect, it } from "vitest";

import { sharedStorybookConfig } from "./index.ts";

describe("sharedStorybookConfig", () => {
  it("always includes the ui and core story globs", () => {
    const config = sharedStorybookConfig({ moduleRoots: [] });

    expect(config.stories).toContain(
      "../../../packages/ui/src/**/*.stories.@(ts|tsx|mdx)"
    );
    expect(config.stories).toContain(
      "../../../packages/core/src/**/*.stories.@(ts|tsx|mdx)"
    );
  });

  it("adds one glob for each selected module root and no blanket module glob", () => {
    const config = sharedStorybookConfig({
      moduleRoots: ["packages/modules/placeholder"],
    });

    expect(config.stories).toContain(
      "../../../packages/modules/placeholder/src/**/*.stories.@(ts|tsx|mdx)"
    );
    expect(config.stories.some((glob) => glob.includes("modules/*/"))).toBe(
      false
    );
  });

  it("produces no module glob for an explicitly empty selection", () => {
    const config = sharedStorybookConfig({ moduleRoots: [] });

    expect(
      config.stories.some((glob) => glob.includes("packages/modules"))
    ).toBe(false);
  });

  it("names the framework and the required addons", () => {
    const config = sharedStorybookConfig({ moduleRoots: [] });

    expect(config.framework).toBe("@storybook/nextjs-vite");
    expect(config.addons).toEqual([
      "@storybook/addon-docs",
      "@storybook/addon-a11y",
      "@storybook/addon-vitest",
    ]);
  });
});

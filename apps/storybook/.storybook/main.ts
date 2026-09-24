import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { sharedStorybookConfig } from "@genie/config/storybook";
import { readModuleInventory, resolveModuleSelection } from "@genie/generators";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const FROM_HOST = "../../..";

// Selection is resolved here, before story collection, so an excluded module is
// never globbed and then hidden. MODULE_INCLUDE unset means every available
// module. An empty string means none.
const selection = resolveModuleSelection({
  moduleInclude: process.env.MODULE_INCLUDE,
  inventory: readModuleInventory(workspaceRoot),
  workspaceRoot,
});

const shared = sharedStorybookConfig({
  moduleRoots: selection.entries.map((entry) => entry.packageRoot),
});

const config: StorybookConfig = {
  framework: shared.framework,
  stories: [
    ...shared.stories,
    `${FROM_HOST}/apps/genie/src/**/*.stories.@(ts|tsx|mdx)`,
  ],
  addons: [...shared.addons],
};

export default config;

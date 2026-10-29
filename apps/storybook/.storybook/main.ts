import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { sharedStorybookConfig } from "@genie/config/storybook";
import {
  moduleSourceLines,
  readModuleInventory,
  resolveModuleSelection,
} from "@genie/generators";
import type { StorybookConfig } from "@storybook/nextjs-vite";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig } from "vite";

import { moduleTailwindSources } from "./module-tailwind-sources.ts";

const here = dirname(fileURLToPath(import.meta.url));

const workspaceRoot = join(here, "../../..");

const FROM_HOST = "../../..";

// Selection is resolved here, before story collection, so an excluded module is
// never globbed and then hidden. MODULE_INCLUDE unset means every available
// module. An empty string means none.
const selection = resolveModuleSelection({
  moduleInclude: process.env.MODULE_INCLUDE,
  inventory: readModuleInventory(workspaceRoot),
  workspaceRoot,
});

const moduleRoots = selection.entries.map((entry) => entry.packageRoot);

const shared = sharedStorybookConfig({ moduleRoots });

const config: StorybookConfig = {
  framework: shared.framework,
  stories: [
    ...shared.stories,
    `${FROM_HOST}/apps/genie/src/**/*.stories.@(ts|tsx|mdx)`,
    // Composition stories: a host outside apps/genie builds the shell from core and ui.
    "../stories/**/*.stories.@(ts|tsx)",
  ],
  addons: [...shared.addons],
  // The shell's Ops Center defaults are static files of the app's public folder (DR-03).
  staticDirs: [{ from: "../../genie/public/brand", to: "/brand" }],
  features: { ...shared.features },
  // Storybook does not read the application's PostCSS setup, so the preview
  // compiles the product stylesheet with Tailwind's own Vite plugin.
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      // The module client's packages. One selection's run fills the optimizer
      // cache, and a later selection that first imports them would reload
      // the browser mid-run and fail its stories.
      optimizeDeps: { include: ["@orpc/contract", "@tanstack/react-query"] },
      plugins: [
        moduleTailwindSources({
          stylesheet: join(here, "preview.css"),
          lines: moduleSourceLines(workspaceRoot, moduleRoots),
        }),
        tailwindcss(),
      ],
    }),
};

export default config;

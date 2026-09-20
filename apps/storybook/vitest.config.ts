import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { componentTestPreset } from "@genie/config/vitest/component";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig, mergeConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      mergeConfig(componentTestPreset, {
        extends: true,
        plugins: [
          storybookTest({
            configDir: join(here, ".storybook"),
          }),
        ],
        test: {
          setupFiles: ["./.storybook/vitest.setup.ts"],
        },
      }),
    ],
  },
});

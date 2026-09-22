import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { componentTestPreset } from "@genie/config/vitest/component";
import { unitTestPreset } from "@genie/config/vitest/unit";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig, mergeConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      // The host's own configuration assertions. They read Nx's resolved
      // project graph and need no browser, so they run as an ordinary unit
      // project beside the story project.
      //
      // The preset is spread rather than merged: it excludes `testing/`, and a
      // merge would keep that exclusion and collect nothing.
      {
        ...unitTestPreset,
        test: {
          ...unitTestPreset.test,
          include: ["testing/**/*.test.ts"],
          // The real-build matrix is `*.integration.test.ts` and runs under
          // vitest.integration.config.ts, so the fast project never stages a
          // workspace or drives a Storybook build.
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/*.integration.test.ts",
          ],
        },
      },
      mergeConfig(componentTestPreset, {
        extends: true,
        plugins: [
          storybookTest({
            configDir: join(here, ".storybook"),
          }),
        ],
      }),
    ],
  },
});

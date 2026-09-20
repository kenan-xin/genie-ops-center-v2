import { playwright } from "@vitest/browser-playwright";
import type { ViteUserConfig } from "vitest/config";

/**
 * The shared component-test preset. apps/storybook merges it.
 *
 * The browser provider runs isolated components. It is not the end-to-end
 * runner, and it needs neither a running Storybook server nor a database.
 */
export const componentTestPreset: ViteUserConfig = {
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
};

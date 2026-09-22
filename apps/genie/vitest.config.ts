import { unitTestPreset } from "@genie/config/vitest/unit";
import { defineConfig } from "vitest/config";

/**
 * The app's own build tooling is tested beside itself, under `tools/`.
 *
 * The shared preset collects `src/` and `contracts/` only, and `testing/` holds
 * the real-service suite that runs behind a Docker build. The registry
 * generator and its guard are pure: they read package metadata and write text,
 * so they belong in the fast run and not behind an image.
 */
export default defineConfig({
  ...unitTestPreset,
  test: {
    ...unitTestPreset.test,
    include: [...(unitTestPreset.test?.include ?? []), "tools/**/*.test.ts"],
  },
});

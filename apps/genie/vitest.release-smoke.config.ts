import { defineConfig } from "vitest/config";

/**
 * The release candidate smoke, run by `scripts/build-customer-image.sh` (and the
 * development wrapper) between the build and the publish.
 *
 * It is a separate collection on purpose: it drives one image the pipeline
 * passes in `GENIE_SMOKE_IMAGE`, so the ordinary integration suite would run it
 * with no candidate and fail. The pipeline is the only caller, and a missing
 * candidate or a missing Docker daemon fails closed rather than skipping.
 */
export default defineConfig({
  test: {
    name: "release-smoke",
    environment: "node",
    include: ["testing/release-smoke.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    passWithNoTests: false,
    testTimeout: 240000,
    hookTimeout: 240000,
    fileParallelism: false,
  },
});

import { unitTestPreset } from "@genie/config/vitest/unit";
import { defineConfig } from "vitest/config";

/**
 * The app's own build tooling is tested beside itself, under `tools/`.
 *
 * The shared preset collects `src/` and `contracts/` only, and `testing/` holds
 * the real-service suite that runs behind a Docker build. The registry
 * generator and its guard are pure: they read package metadata and write text,
 * so they belong in the fast run and not behind an image.
 *
 * `testing/image-scan.ts` is the same kind of pure logic — the image history and
 * filesystem checks are ordinary functions over an inventory — so its unit test
 * is named explicitly here. `testing/` stays excluded as a directory, or the
 * real-service files would be collected into the fast run; only the pure files
 * are re-included, `shared-empty-image`'s input digest alongside it.
 */
const preset = unitTestPreset.test;

export default defineConfig({
  ...unitTestPreset,
  test: {
    ...preset,
    include: [
      ...(preset?.include ?? []),
      "tools/**/*.test.ts",
      "testing/image-scan.test.ts",
      "testing/shared-empty-image.test.ts",
      "testing/image-ports.test.ts",
      // The Entra secret parser is pure; it must never echo the secret it refuses.
      "e2e/entra/tenant.test.ts",
    ],
    // No include glob reaches the browser specs, so lifting the `e2e/**` exclusion collects only
    // the one pure file named above.
    exclude: (preset?.exclude ?? []).filter(
      (glob) => glob !== "testing/**" && glob !== "e2e/**"
    ),
  },
});

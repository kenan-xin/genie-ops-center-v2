import { unitTestPreset } from "@genie/config/vitest/unit";
import { defineConfig } from "vitest/config";

// The workspace checks run under the Nx `validate` target, which declares the
// workspace-wide inputs that they read. Two disjoint collections stop a unit run
// from replaying those checks against a stale hash.
export default defineConfig({
  ...unitTestPreset,
  test: {
    ...unitTestPreset.test,
    exclude: [
      ...(unitTestPreset.test?.exclude ?? []),
      "src/workspace/validate/**",
    ],
  },
});

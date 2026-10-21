import { unitTestPreset } from "@genie/config/vitest/unit";
import { defineConfig } from "vitest/config";

// The repository-wide workspace checks live in their own `@genie/workspace-validation`
// project, whose `validate` target declares the workspace-wide inputs they read, so
// this unit run never replays them.
export default defineConfig(unitTestPreset);

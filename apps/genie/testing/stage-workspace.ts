import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  stageWorkspace,
  WORKSPACE_ROOT,
} from "@genie/core/testing/stage-workspace";

/**
 * A disposable copy of the workspace under the operating system's temporary
 * directory, outside the repository's inventory, for an image build that needs
 * a changed build input. The repository itself is never touched.
 *
 * Each call allocates its own uniquely named stage, so a caller can only ever
 * delete a path it knows it owns.
 *
 * The staging itself lives in `@genie/core/testing/stage-workspace`, shared with
 * the Storybook matrix so the prune list cannot drift between the callers.
 */
export const REPO_ROOT = WORKSPACE_ROOT;

export { stageWorkspace };

/**
 * Copies one fixture template from `apps/genie/tools/fixture-modules/<id>` into
 * the stage as an ordinary module package under `packages/modules/<id>`.
 */
export function stageFixtureModule(stage: string, id: string): void {
  const source = join(REPO_ROOT, "apps/genie/tools/fixture-modules", id);

  if (!existsSync(join(source, "package.json"))) {
    throw new Error(`missing fixture template: ${source}`);
  }

  cpSync(source, join(stage, "packages/modules", id), { recursive: true });
}

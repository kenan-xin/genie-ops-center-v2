import type { MigrationRun } from "./index.ts";

declare const run: MigrationRun;

// The omission guard cannot be bypassed by deriving a module list from histories.
// @ts-expect-error compiledModuleIds is required
const missingCompiledList: MigrationRun = {
  ...run,
  compiledModuleIds: undefined,
};

const withCompiledList: MigrationRun = { ...run, compiledModuleIds: [] };

void missingCompiledList;

void withCompiledList;

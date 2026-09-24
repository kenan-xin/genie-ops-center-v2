import type { MigrationRun } from "./index.ts";

declare const run: MigrationRun;

// The omission guard cannot be bypassed by deriving a module list from histories.
const missingCompiledList: MigrationRun = {
  ...run,
  // @ts-expect-error compiledModuleIds is required
  compiledModuleIds: undefined,
};

const withCompiledList: MigrationRun = { ...run, compiledModuleIds: [] };

void missingCompiledList;

void withCompiledList;

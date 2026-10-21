import type { MigrationRun } from "./index.ts";

declare const run: MigrationRun;

// The omission guard cannot be bypassed by deriving a module list from histories. The rest
// destructuring drops the key entirely, so the diagnostic is the missing required field rather
// than an `undefined` assigned to it.
const { compiledModuleIds: _omitted, ...withoutCompiledList } = run;

// @ts-expect-error compiledModuleIds is required
const missingCompiledList: MigrationRun = withoutCompiledList;

const withCompiledList: MigrationRun = { ...run, compiledModuleIds: [] };

void _omitted;

void missingCompiledList;

void withCompiledList;

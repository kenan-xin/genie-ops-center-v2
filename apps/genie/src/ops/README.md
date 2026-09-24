# apps/genie/src/ops

The `genie-ops` command entry.

## What belongs here

`entry.ts`, the thin entry the core runner is called from (D-10): it reads the compiled module
ids and histories from the registry and hands the command line, the environment and the two
output sinks to `runGenieOps`. The `genie-ops` executable on the image's `PATH` loads this entry
through the instrumentation module, which the build bundles with the same traced migration SQL
the server reads.

## What must not go here

Command logic, a connection, a table read, or a second audit writer. The core runner owns the
parse, the tenant context, the command and the audit row (R-63).

## Adding a command

Add it to `packages/core/src/services/ops/`, not here. This entry stays thin so the worker entry
of Section 1 can reuse the same mechanism.

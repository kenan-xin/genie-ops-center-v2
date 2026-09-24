# packages/core/src/services/ops

The `genie-ops` command runner.

## What belongs here

`runGenieOps`, the one runner of R-63: parse the command with node's `parseArgs` (D-4), build
the tenant context from the validated environment, run the command, and write the one audit row
around it through the audit helper (R-64). `migrate` is the command this section ships; it logs
the pending count before the migrator run (R-9, R-10).

## What must not go here

A command that builds its own connection, a second audit writer, a per-command argument parser
outside `parseArgs`, and any module-specific command. The runner owns the context and the audit
row; a command receives both.

## What it imports

The environment validator, the tenant-context factory, the audit helper, the logging redactor
and the migrator run beside it.

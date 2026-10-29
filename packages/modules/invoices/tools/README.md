# packages/modules/invoices/tools

The module's test-time entrypoints.

## What belongs here

The integration entrypoint, `run-required-tests.ts`: it runs this module's
real-database suite through core's shared runner and fails the run when a
mandatory case did not execute.

## What must not go here

Runtime code the module ships, a database client, an import of another module,
and any customer-specific content.

## What it imports

`@genie/core`'s shared test runner and this module's own guard manifest, never
another module.

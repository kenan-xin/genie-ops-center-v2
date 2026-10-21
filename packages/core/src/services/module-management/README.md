# packages/core/src/services/module-management

The one procedure that switches a compiled module on or off.

## What belongs here

`setModuleEnabled`, the shared enable/disable procedure of R-68 that `genie-ops module
enable|disable` and the Section 3 Modules page both call, so the two cannot diverge. It refuses a
module id the image did not compile (`module-not-compiled`) and an id with no `tenant_module` row
(`module-not-registered`, because only the seed step and the migrator run register rows — R-20,
DEC-50). The row is read `FOR UPDATE` and written in one transaction, so a concurrent configuration
save cannot race the validation. On a real disable-to-enable transition it validates the row's
`tenant_module.config` against the module's declared `ModuleConfiguration` schema (R-68a); a
missing or invalid required value refuses with `module-config-invalid` and actionable `issues`,
leaving the row disabled and `enabled_at` unchanged. Disable validates nothing. A repeated enable or
disable is a no-op, and the call returns `{ changed }` so a caller can tell it was the transition.

## What must not go here

An insert of a `tenant_module` row (registration belongs to the seed step and the migrator run), an
audit write (the runner owns the one audit row), a connection of its own (it takes the tenant
context, DEC-34), and a second copy of the compiled module ids (it takes the compiled modules,
D-12).

## What it imports

The module contract type, the tenant-context type, the `withTransaction` helper and the
`tenant_module` table beside it.

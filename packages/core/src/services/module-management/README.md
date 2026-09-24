# packages/core/src/services/module-management

The one procedure that switches a compiled module on or off.

## What belongs here

`setModuleEnabled`, the shared enable/disable procedure of R-68 that `genie-ops module
enable|disable` and the Section 3 Modules page both call, so the two cannot diverge. It refuses a
module id the image did not compile (`module-not-compiled`). On enable it validates the row's
`tenant_module.config` against the module's declared `ModuleConfiguration` schema (R-68a); a
missing or invalid required value refuses with `module-config-invalid` and actionable `issues`,
leaving the row disabled and `enabled_at` unchanged. Disable validates nothing.

## What must not go here

An audit write (the runner owns the one audit row), a connection of its own (it takes the tenant
context, DEC-34), and a second copy of the compiled module ids (it takes the compiled modules,
D-12).

## What it imports

The module contract type, the tenant-context type and the `tenant_module` table beside it.

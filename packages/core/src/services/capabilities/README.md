# packages/core/src/services/capabilities

The capabilities channel: `provide` and `get` on the tenant context (R-58).

## What belongs here

The per-context provider registry. The named interfaces themselves live in
`packages/core/contracts`, and `registerModuleRuntime` is what fills the registry from module
declarations.

## What must not go here

An interface definition (that is a contract), a fallback when no provider exists (a consumer
behaves when the answer is nothing), and any lookup of a module by import.

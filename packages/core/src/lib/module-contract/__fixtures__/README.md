# packages/core/src/lib/module-contract/__fixtures__

The module declarations the contract tests validate against.

## What belongs here

One declaration that satisfies every point of the contract, and the transforms
that break exactly one rule of it. A transform changes the one point under test
and leaves every other point intact, so a test failure names a single rule.

## What must not go here

A real module, a service, a database read, and anything exported from a public
entry point. A fixture here is test-side only; a module that ships lives in
`packages/modules/`.

## What it imports

The module contract types and permission-key primitives beside it, and the
declaration-site dependencies a module contract names: zod, Drizzle, tRPC and
React types.

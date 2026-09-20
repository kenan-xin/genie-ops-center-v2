# src

The module's source. `index.ts` is the one public surface; everything else is
reached through it.

## What belongs here

The three folders the repository convention names, created only when they hold
something: `lib/` for a mini-package with its own API, `services/` for work the
application does, and `utils/` for a small generic stateless helper. In Section 0
only `presentation/` exists, because this module renders and does nothing else.

## What must not go here

A server module declaration, a schema, a router, and a permission evaluation.
S0-04 adds those. Nothing here may read the database, the deployment environment,
or the runtime registry.

## What it imports

`@genie/ui`, `react`, and its own files. Never another module, never an app,
never a customer folder, never a database driver.

# src

The module's source. `index.ts` is the module-facing surface the application imports, and
`presentation/index.ts` is the client surface a story and the shell import.

## What belongs here

The module declaration, its schema, its router, and the three folders the repository convention
names, created only when they hold something: `lib/` for a mini-package with its own API,
`services/` for work the application does, and `utils/` for a small generic stateless helper.
`presentation/` holds the components and their fixtures.

## What must not go here

A permission evaluation of its own: every check goes through core's `can()`. A read of the
deployment environment or of the runtime registry. A database driver: the router reads through
`ctx.tenant.db`, which core owns. A factory for this module's tables, which lives in `testing/`.

## What it imports

`@genie/core`, `@genie/ui`, `react`, `zod`, `@trpc/server`, `drizzle-orm`, and its own files.
Never another module, never an app, never a customer folder, never a database driver.

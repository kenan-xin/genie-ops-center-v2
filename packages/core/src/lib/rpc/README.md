# packages/core/src/lib/rpc

The module API seam on oRPC (ADR 0011). This folder and the app's oRPC files are the only places
that import `@orpc/*`, so a later oRPC upgrade touches only them.

## What belongs here

The browser-safe `@genie/core/rpc` entry (`index.ts`): `oc` to declare a contract, and the
`appErrorData` schema a client parses refusals with. Beside it, the server half that the core
root exports: `implementModule`, which attaches the entitlement gate and the session check before
input validation, the conformance check module validation runs, and `callProcedure`, the one
server-side caller.

## What must not go here

Server code in `index.ts`: a lint rule keeps it to `@orpc/contract` and zod. A re-export of
`ORPCError`: a router throws the catalogue `AppError`. The HTTP handler, the error interceptor and
the browser client, which live in the app's `src/rpc/`.

## What it imports

`@orpc/contract`, `@orpc/server`, zod, and core's error catalogue and module contract types.

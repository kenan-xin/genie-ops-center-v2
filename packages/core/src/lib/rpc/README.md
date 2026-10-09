# packages/core/src/lib/rpc

The module API seam on oRPC (ADR 0011). This folder and the app's oRPC files are the only places
that import `@orpc/*`, so a later oRPC upgrade touches only them.

## What belongs here

The browser-safe `@genie/core/rpc` entry (`index.ts`): `oc` to declare a contract, and the
`appErrorData` schema a client parses refusals with. Beside it, the server half that the core
root exports: `implementModule`, which attaches the entitlement gate and the session check before
input validation, the conformance check module validation runs (the router serves exactly the
contract's procedures, each starts with both gates, and no lazy router or root `.use()` is
allowed), and `callProcedure`, the one server-side caller. `implementCoreArea` builds the
implementer of one of core's own areas (`audit`, `groups`, `people`, `roles`): only the session
check before input validation, never the entitlement gate, because a core area has no entitlement
row. A core service builds its router through it, since it may not import `@orpc/*`; the area's
tests hold its contract to decision 7 with `contractRouteProblems`.

## What must not go here

Server code in `index.ts`: a lint rule keeps it to `@orpc/contract` and zod. A re-export of
`ORPCError`: a router throws the catalogue `AppError`. The HTTP handler, the error interceptor and
the browser client, which live in the app's `src/rpc/`.

## What it imports

`@orpc/contract`, `@orpc/server`, zod, and core's error catalogue and module contract types.

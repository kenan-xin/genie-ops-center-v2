# packages/core/src/lib/rpc

The module API seam on oRPC (ADR 0011). This folder, the app's oRPC files and the OpenAPI build
script (`apps/genie/tools/generate-openapi.ts`) are the only places that import `@orpc/*`, so a
later oRPC upgrade touches only them.

## What belongs here

The browser-safe `@genie/core/rpc` entry (`index.ts`): `oc` to declare a contract, and the
`appErrorData` schema a client parses refusals with. The browser-safe `@genie/core/rpc/client`
entry (`module-client.tsx`): `ModuleClientProvider` and `useModuleClient(contract)`, which hand a
module the sub-client of the app's one RPC client under the key that its contract's paths start
with, so neither core nor the module names the id. Beside the root entry, the server half that
the core root exports: `implementModule`, which attaches the entitlement gate and the session
check before input validation, the conformance check module validation runs (the router serves exactly the
contract's procedures, each starts with both gates, and no lazy router or root `.use()` is
allowed), and `callProcedure`, the one server-side caller. `implementCoreArea` builds the
implementer of one of core's own areas (`audit`, `groups`, `people`, `roles`): only the session
check before input validation, never the entitlement gate, because a core area has no entitlement
row. `gatedArea` adds the area's one `can()` gate, also before input validation, so no core router
copies the gate. A core service builds its router through these, since it may not import
`@orpc/*`; the area's tests hold its contract to decision 7 with `contractRouteProblems`.

## What must not go here

Server code in `index.ts`: a lint rule keeps it to `@orpc/contract` and zod. A re-export of
`ORPCError`: a router throws the catalogue `AppError`. The HTTP handler, the error interceptor and
the app's one RPC client (its `RPCLink` and its 401 handling), which live in the app's `src/rpc/`.

## What it imports

`@orpc/contract`, `@orpc/server`, zod, React for the client entry, core's error catalogue and
module contract types, and `can()` from the authorization service.

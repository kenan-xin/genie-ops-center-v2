---
status: accepted
date: 2026-10-09
amends: ADR 0008 (the transport named in its runtime integration)
---

# Replace tRPC with oRPC as the module API and transport

tRPC is removed everywhere in one change and replaced by oRPC 1.15.5. A module's API becomes a contract, separate from its implementation, built on the browser-safe `@genie/core/rpc` entry, and its router is built by core from that contract. oRPC also describes the same procedures as OpenAPI for later REST callers and is the transport the browser client uses through TanStack Query. This record amends the transport rows of `../core/tech-stack.md` and `../architecture/module-contract.md`, and the tRPC wording of [ADR 0008](0008-foundation-integration-and-generated-registry.md).

## Why

The owner named four reasons, all accepted:

- An OpenAPI description of the same procedures, for later REST callers.
- Contract-first modules: a module API is a contract, separate from its implementation.
- Native streaming (event iterators) and `File`/`Blob` input, for later chat and upload work. tRPC 11 also has both, so this reason alone does not justify the switch.
- A simpler API surface.

## Product impact

No screen, permission, or sign-in behavior changes, and every refusal keeps its status code (400, 401, 403, 404, 429). The transport path changes from `/api/trpc` to `/api/rpc`, which no person sees. One new platform question opens: how a machine caller (not a browser session) authenticates to a REST API. It is recorded as `OPEN-10` in `../core/vision.md`, and no public REST endpoint ships until it closes.

## Decisions

Each decision below states what was chosen and its gain, then the cost of the choice, including the rejected alternative that carried that cost.

| # | Decision | Chosen | Gain | Cost |
| --- | --- | --- | --- | --- |
| 1 | Scope | Full replace now, in one feature branch, merged once | One RPC stack, no dual maintenance | One large change; interop through `@orpc/trpc` `toORPCRouter` was rejected because it keeps two RPC stacks alive |
| 2 | Version | Every `@orpc/*` package pinned to exactly `1.15.5` in one pnpm catalog. The oRPC behaviors the code relies on are listed below, and each has a test | A stable line whose relied-on behavior fails CI rather than production when it changes | Moving to 2.x is deferred to a separate chore; `2.0.0-beta.42` was rejected because 42 betas landed in 15 weeks with breaking changes as late as beta.37, so every bump would be planned work |
| 3 | Module API | Contract-first. A module's `contract.ts` imports only zod and the client-safe subpath `@genie/core/rpc`, and is published as the module's `./contract` export. Its router comes from core's `implementModule(id, contract)` | The client type no longer depends on server code, and a module declares its API once | Every module carries a contract file; router-first was rejected because the client type would depend on server code |
| 4 | OpenAPI | Spec only. One document, generated from core's contracts plus every module in `packages/modules/*` in id order, is checked in, and CI fails when it differs. No `OpenAPIHandler` is mounted | A reviewed document of the same procedures without shipping a second surface | No live REST endpoint; same-session REST or a full external API with tokens is blocked on `OPEN-10`, and one document per image was rejected because the module set differs per customer and spec-only has no consumer yet. The generated-outputs-stay-uncommitted rule of [ADR 0008](0008-foundation-integration-and-generated-registry.md) governs the module registry; this document is a deliberate committed exception, so every API change shows up in code review, and the CI diff check keeps it honest |
| 5 | Transport | No batching. RPC is POST-only: the 1.x `RPCHandler` also serves `GET`, so the route file exports only `POST`, and the client keeps `RPCLink`'s default `POST`. No `CORSPlugin`. The `/api/rpc` handler calls the existing `stateChangeOriginAllowed` first | Fewer moving parts, and HTTP/2 already multiplexes | No request batching; batch plugins were rejected as more moving parts |
| 6 | Errors | Core's `AppError` catalogue is the only error vocabulary. Routers throw `AppError` (`forbidden`, `not-found`, and others), never a protocol error, and core does not re-export `ORPCError`. One handler `interceptors` entry (not `rootInterceptors`, which run outside the error handling, and not client interceptors, which miss decode errors) logs the raw error with the request id, then turns an `AppError` into `ORPCError(code, { status, message: safeMessage, data })`. It always builds `data` fresh as `{ appCode, requestId, retryAfterMinutes? }` and never passes oRPC's own `data` through, because a `BAD_REQUEST` carries zod issues. The status comes from `httpStatusForCode` (`apps/genie/src/http-errors.ts`), so both transports answer the same status. oRPC's own `BAD_REQUEST` (input validation) maps to `invalid-input`, and so does a malformed body (see the behavior list below). Everything else answers the generic 500. One zod schema `appErrorData` (`appCode`, `requestId`, `retryAfterMinutes?`) in `@genie/core/rpc` parses error data on the client | One error vocabulary with a matching HTTP status across both transports | One interceptor must build `data` fresh and cannot pass oRPC's own data through; typed `.errors()` per contract was rejected as a second error vocabulary beside the catalogue |
| 7 | REST routes | Every contract procedure declares its method and path with `oc.route({ method, path })`, where `oc` comes from `@genie/core/rpc`. A module's paths are `/<moduleId>` or start with `/<moduleId>/`, and core's are its area or start with it (`/audit`, `/groups`, `/people`, `/roles`), so a collection reads and creates at the bare prefix (`GET /people`, `POST /people`). Ids go in the path, named after the input key (`{personId}`), because oRPC fills path parameters from input keys. Reads use `GET` with an object input or none, creation `POST`, field changes `PATCH`, removal `DELETE`, and actions `POST /<prefix>/{id}/<action>` (for example `POST /people/{personId}/resend-invitation`). Module validation refuses a procedure with no route or with a path outside its own prefix | One checked-in document with stable paths | Every contract declares a route and changes a second time when REST goes live; default paths were rejected as valid but plain, and `PATCH` for actions was rejected because it hides actions that change no field and write their own audit event |

## Seams that keep their behavior

- Gate order (R-14, d1y): `implementModule` attaches the entitlement gate and then the session check with the root `implementer.use()` only. Each core area attaches only the session check, also on the root `implementer.use()`, because core areas have no entitlement row and the reader answers disabled for an id without one. In 1.15.5, middleware added through the implementer's `.use()` counts toward `inputValidationIndex` and runs before input validation, while a procedure-level `.use()` after `.handler()` setup runs after it. Keep the default `initialInputValidationIndex` of 0. A disabled module answers `module-disabled`, and an anonymous caller answers `unauthenticated`, before any input is parsed.
- Unmatched requests: when `RPCHandler` answers `{ matched: false }` (an unknown path), the `/api/rpc` route answers the catalogue `not-found` body at 404 with the request id, as tRPC does today. One test covers it.
- Router ownership and conformance: `implementModule` records `{ id, contract }` for each router it builds. Module validation refuses a router that core did not build for that id, a contract that is not the declared one, and any contract procedure that `traverseContractProcedures` finds but the router does not resolve. oRPC enforces conformance only in types, and a missing procedure otherwise fails at request time.
- Reserved ids: `validateModule` reserves `audit`, `groups`, `people` and `roles` beside `core`, and router composition throws on a duplicate key.
- Import boundary: a module imports oRPC helpers only from `@genie/core/rpc`, never from `@orpc/*`. A rule like the `packages/core/contracts/**` rule keeps `@genie/core/rpc` free of server code.
- oRPC confinement, so a later 2.x upgrade touches only these files: one oxlint `no-restricted-imports` rule bans `@orpc/*` everywhere except four places. They are core's `packages/core/src/lib/rpc/`, the app's `apps/genie/src/rpc/` (handler options, error interceptor, browser client), the route file under `apps/genie/src/app/api/rpc/`, and the OpenAPI build script. Inside `packages/core/src/lib/rpc/`, the `@genie/core/rpc` entry file exports only browser-safe values (`oc` from `@orpc/contract`, and `appErrorData`). `implementModule`, the conformance check, and one server-side caller `callProcedure` (built on `createRouterClient`) live beside it and are exported from the core root, never from `@genie/core/rpc`. Tests call procedures through `callProcedure` instead of importing `@orpc/*`. A `boundaries.test.ts` case proves the rule refuses an import from a module, a core service, and an app screen.
- Route contract: the `/api/rpc` handler reuses the proxy's `x-request-id`, runs each call inside `correlationScope.run`, logs the original error before converting it (AC-15), and sets `CONTEXT_HEADER` (AC-26).
- `TenantContext` and the per-request loader (`DEC-34`, request-scoped grants) enter through the handler `context`, as they enter the tRPC context today.
- Screens keep `useQuery` with an oRPC `queryFn`, or `createTanstackQueryUtils(...).x.queryOptions()`. TanStack Query stays the owner of server state.

## oRPC behaviors the code relies on

Each item gets one test, so a version bump that changes one fails CI and not production.

- Middleware added through the implementer's `.use()` runs before input validation.
- `ORPCError`'s `status` option sets the HTTP status.
- A `GET` to `/api/rpc` is refused because the route exports only `POST`. The handler's default `StrictGetMethodPlugin` would allow `GET` for every read, since decision 7 gives reads `method: "GET"`, so the export is the guard. `strictGetMethodPluginEnabled` and `dedupeLeadingMiddlewares` stay at their defaults (on and true); with dedupe off, the gate would run twice.
- A malformed request body answers `invalid-input` at 400. In 1.15.5 the decode failure reaches the handler `interceptors` as a raw `SyntaxError` or `TypeError`, because oRPC's own conversion to `BAD_REQUEST` sits outside the interceptor chain. A marker `clientInterceptors` entry records per request that the procedure started; the interceptor maps a raw error from before that point to `invalid-input` 400, and one from after it to the generic 500.
- An error reaches a raw reader as `{ json: { defined, code, status, message, data } }`, so `isUnauthenticatedAnswer` reads `json.data.appCode`.
- `getHiddenRouterContract` and `traverseContractProcedures` exist with today's shape.
- `oc.route({ method, path })` drives the generated paths and methods, with the zod 4 converter from `@orpc/zod/zod4`.
- The `@orpc/*` 1.15.5 types compile under the repository's TypeScript 6. oRPC states no supported TypeScript range, so the first typecheck gate of the implementation is the proof.

## Known 2.0 breaks

Read from the 2.0.0-beta.42 package by the review of this decision. `.route()` moves to `.meta(openapi(...))`. `ORPCError` loses `status`, which moves to the handler's `errorStatusMap`. `RPCHandler` becomes POST-only by default. `initialInputValidationIndex` and middleware dedupe are removed, so only root middleware runs before validation. The zod converter moves from `@orpc/zod/zod4` to the `@orpc/zod` root.

The beta.37 removal does not touch our error interceptor (checked 2026-10-09 in the beta.42 type files and the v1-to-v2 migration guide). Beta.37 removed `adapterInterceptors` from handlers and links, and renamed the handler plugins to the `HandlerPlugin` suffix under `@orpc/server/plugins`. We use neither. The handler `interceptors` option that our interceptor uses still exists in beta.42 (`StandardHandlerOptions`, "run after routing and before error handler, useful for error handling"). Three related changes do reach the four confined places:

| 2.0 change | Where it lands | Effort |
| --- | --- | --- |
| `rootInterceptors` renamed `routingInterceptors` | Nothing, because we use `interceptors` | None |
| `ORPCError` loses `status`, and the error body loses its `status` field | The interceptor drops `status` and the handler gets `errorStatusMap` from the `httpStatusForCode` table. A raw reader that reads `json.status` breaks, but `isUnauthenticatedAnswer` reads `json.data.appCode` | About an hour |
| `RPCLink`'s `url` splits into `origin` plus a path-only `url` | The browser client in `apps/genie/src/rpc/` | One line |

Not confirmed: that a malformed request body still reaches the handler `interceptors` in 2.0. The migration guide says regular interceptors "can now customize body parsing", which suggests yes. The malformed-body test in the behavior list above proves it at upgrade time. Re-check the marker `clientInterceptors` entry at the 2.x upgrade as well: if 2.0 converts a decode failure inside the interceptor chain, or no longer passes the request context by reference to client interceptors, the marker is either redundant or wrong.

## Output schemas

Core contracts declare their outputs with `z.custom<ServiceType>()`. The client gets real types, but nothing checks an output at run time, and the OpenAPI document shows these responses as unconstrained. Real zod output schemas must land before any REST endpoint ships (`OPEN-10`).

## Out of scope

- Server-side prefetch and hydration: no screen uses it today, and the tech-stack paragraph that describes it is rewritten to match the code. A Bead opens when a screen needs it.
- Streaming procedures and file input: no current feature needs them. When file input comes, the origin check in decision 5 already covers `multipart/form-data`.
- A mounted REST API and machine-caller authentication: wait for `OPEN-10`.
- Rewriting history: old ticket evidence, reviews and transcripts that name tRPC describe the past and stay as they are.

## Revisit

Move to 2.x as a separate chore once `2.0.0` is stable. The "oRPC behaviors the code relies on" list is the guard: each item has one test, so a version bump that changes one fails CI and not production. The "Known 2.0 breaks" list above is the work the chore inherits, and the four confinement places keep it bounded to core's RPC entry, the app's oRPC folder, the route file, and the OpenAPI build script.

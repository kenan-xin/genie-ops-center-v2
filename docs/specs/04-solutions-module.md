Confidence: 8.0/10

Business scenarios: [CF-MA-02–09](../flows/module-access-upgrades.md) apply through the shared permission-evolution policy, especially independent role copies, broad grants covering future records rather than future actions, and retained access on re-enable. R-6a/R-30 and the Section 2 upgrade proof own these guarantees; illustrative approval examples add no Solutions permissions.
Reasoning: Every core work item in Section 4 has a named owner document, and the solutions domain definitions are complete and internally consistent in `../modules/solutions/`, so the requirements below are citation work rather than invention. The drift findings that would have broken the route are fixed at their source: the message-stream mapping in `../modules/solutions/chat-proxy.md` matches AI SDK 7 ordering, the streaming route mounts under the module endpoint prefix with session authentication, the route validates the upstream before it commits its response and keeps the browser connection alive through an edge, and the renderer and Access tab proposals were decided on 2026-09-18, so no open question remains. The score is held below nine by two things documentation cannot settle: the streaming route is the one genuinely new core capability and no implementation of it exists to measure, and the external chat API contract is a dated observation that must be revalidated before the route ships (R-42). Sections 0, 2, and 3 must also deliver the record-type, navigation-tree, and shell contracts exactly as written for this section to add no core change.
Status: Draft — awaiting user approval

## Goal and scope

Section 4 delivers the solutions module as the first real module and proves the module contract on known behavior before any customer module is built. This specification holds only what core must do and how the module is mounted, tested, and gated. It does not restate a solutions domain definition. Types, statuses, limits, tables, permission keys, chat behavior, and the proxy contract are owned by `../modules/solutions/README.md` and `../modules/solutions/chat-proxy.md`, and this specification cites them.

In scope: the registry mounting the module with no special case, the `can()` and `scopesFor()` seam resolving `solution:<id>` scopes end to end, the streaming route pattern provided by core as a reusable service, entitlement gating in both forms, the module's tests through the shared presets, the module's `frame-src` contribution, the module-local `solutions:feedback` event declaration, the audited administrator preview, and the interaction with the core Categories page.

Out of scope: anything the module's own definition of done owns (`../modules/solutions/README.md`, "Done when"), which this specification references rather than repeats. Also out of scope: a core Dashboard page (`DEC-49`), a dashboard widget slot (`../architecture/module-contract.md`, "How the contract grows"), a second consumer of the streaming service, and transcript storage (`DEC-27`).

Boundary with earlier sections. Section 0 delivers the module contract types, the generated registry, the migration histories, the navigation tree shape, the record-type shape, and the content security policy origins point (`../specs/README.md`, "Section boundaries"). Section 1 delivers the entitlement filter, the event bus, the audit helper, and the tenant context readers. Section 2 replaces the stub `can()` with the real evaluator, seeds default roles on entitlement, and adds the navigation permission filter. Section 3 renders the shell tree, the pinned rail, the Categories page, and the Modules page category picker. Section 4 adds exactly one new core capability, the streaming route pattern, and otherwise adds no core change.

Boundary with later work. Customer modules start after this section and their own discovery (`../core/roadmap.md`, "Customer modules"). The second consumer of the streaming service is one of them, and it is not designed here.

## Sources

Roadmap: `../core/roadmap.md`, Section 4 items 1 to 5 and its done-when, "Customer modules", and "Order and parallelism".

Module documents, canonical for every solutions domain definition: `../modules/solutions/README.md` ("What it does", "Permissions and roles", "Solution configuration", "Chat behavior", "Tables", "Admin actions", "Work items", "Done when", "Decisions" `DEC-26`, `DEC-27`, `DEC-30`, "Defaults", "Open decisions" `OPEN-S1`), `../modules/solutions/chat-proxy.md` ("Request", "Upstream call", "Mapping", "Conversation model", "Error mapping", "Rendering rules (client)"), `../modules/solutions/external-chat-api-contract.md` (all).

Architecture: `../architecture/module-contract.md` ("What a module declares", "What core provides to a module", "How modules talk to each other", "What a module must not do"), `../architecture/data-shape.md` ("Rules", "Module tables", "Roles and permissions", "Navigation", "Deployment tables", "Relationships across the boundary"), `../architecture/environment-contract.md` ("Optional", "Rules"), `../architecture/repository-layout.md` ("Layout", module package tree).

Decisions: `../core/decision-log.md` `DEC-29`, `DEC-33`, `DEC-34`, `DEC-39`, `DEC-42`, `DEC-46`, `DEC-48`, `DEC-49`, `DEC-50`, `DEC-51`, and `../core/vision.md` "Decided" and "Modules".

Tech stack: `../core/tech-stack.md`, the Chat rendering, Rate control, and Data fetching rows.

Design, presentation owner: `../design/sections/solutions/spec.md` and `../design/sections/solutions/types.ts`, `../design/shell/spec.md` ("Navigation Structure" and the module-contract Navigation line under "Design Notes"), `../design/README.md` ("Standing check").

Sibling specifications: `00-monorepo-foundation.md`, `02-identity-and-access.md`, `03-shell-branding-and-design-system.md` for the contracts this section consumes, and `README.md`, "Section boundaries" and "Cross-section calls made in the drafting round" for the readings the six drafts share.

## Requirements

### Registry and mounting

R-1. The solutions module is mounted by the generated registry in `apps/genie/src/modules.ts` through the module contract only. No core file, no app file, and no shared configuration names the module id outside the generated registry and the customer include lists. A search for the module id in `packages/core` returns nothing. Source: `../core/roadmap.md` Section 4 item 1, `DEC-33`, `../architecture/repository-layout.md` "Layout".

R-2. The module ships one Drizzle schema file and its own drizzle-kit migration history with its own migrations table, applied after the core history and only in an image that includes the module. Source: `../architecture/data-shape.md` "Rules" 2 and "Module tables" 5, `DEC-33`. The tables themselves are defined in `../modules/solutions/README.md`, "Tables".

R-3. The module's tRPC router is mounted under the module id when the entitlement is enabled. Every procedure is behind `can()` and reads only through `ctx.tenant`. No procedure imports a database driver or opens a connection. Source: `../architecture/module-contract.md` "What a module declares" Router, `DEC-34`.

R-4. The module's permission keys are registered from its declaration and appear in the role editor, in `can()`, and in the access column of the Modules page. The keys are owned by `../modules/solutions/README.md`, "Permissions and roles". Because the module ships admin pages it declares `<id>:admin`, and enabling the entitlement appends that key to the `Tenant administrator` system role while disabling it removes the key again. Source: `../architecture/module-contract.md` Permission keys row, which names the module's admin key as the pattern, and `../architecture/data-shape.md` "Roles and permissions".

R-5. The module declares `solutions:use` and requires it on every workspace navigation entry, and seeds a `Solutions user` default role that carries it, because it has a workspace entry. Source: `DEC-50`, `../architecture/module-contract.md` Permission keys and Default roles rows. The role names and their key sets are owned by `../modules/solutions/README.md`, "Permissions and roles".

R-6. Default roles are seeded when `tenant_module.enabled` becomes true, are marked `is_system`, and carry the module id in `role.module_id`. Seeding is idempotent, because `genie-ops setup`, `genie-ops module enable`, and the Modules page all reach it through the one core procedure that writes `tenant_module.enabled`. Source: `../architecture/data-shape.md` "Roles and permissions", `DEC-50` Guard.

R-6a. Seeding and upgrades follow `../architecture/permission-evolution.md` and Section 2 R-33a–R-33c. Do not overwrite existing role permission sets or reconnect custom copies to system defaults. New solution records remain covered by existing whole-module use grants, but new actions require their own authority. This section adds no permission keys beyond the module README; future changes need explicit policy-compliant migrations and the shared upgrade test matrix.

R-7. The module returns a navigation tree of the shape `{ pinned, entries }` resolved per request after `can()`. Core groups the entries by the core `category` table, places the module's static workspace entries under `tenant_module.category_id`, renders one tree, and persists collapse state per device. Core never reads a module table to build the tree. Source: `../architecture/module-contract.md` Navigation row, `DEC-51`.

R-8. One workspace entry of the module is marked the landing route, and core sends a person there after sign-in. This section introduces the real solutions landing entry; Sections 0 and 3 prove their contracts with fixtures without requiring solutions. Core holds no page of its own at that address. At most one entry across all compiled modules may carry the flag, and the registry fails the build on two; zero is valid for builds without a landing module. When no entitled module declares one, or the person cannot reach it, the shell opens its no-grants empty state. Source: `DEC-49`, `README.md` "Cross-section calls made in the drafting round", Landing route row.

R-8a. The landing-route flag is independent of where the entry sits. With no category set for the module the entry sits in the workspace block, and when an administrator picks a category on the Modules page the same static entry renders under that heading. Source: `README.md` "Cross-section calls made in the drafting round", Hub entry placement row, `DEC-50`, `../design/shell/spec.md` "Navigation Structure".

R-9. An entry that carries a `categoryId` whose `category` row no longer exists is treated as carrying no category, by the module when it builds the entry and by core when it groups. Nothing in core or in the module deletes or rewrites a module row when a category is deleted. Source: `DEC-51`, `../modules/solutions/README.md` "What it does".

R-10. The module declares no configuration schema, so Tenant Settings renders no section or search entries for it. Per-solution configuration remains in Solutions, not an empty central Settings section. Source: the module contract's Settings discovery and authorization boundary, `DEC-30`.

### The access seam

R-11. The module declares a record type for its solutions with the scope type used in role assignments, an empty parent list, and a resolver from id to `{ label, path? }`. The resolver returns a `path` only for a route the caller may open under `can()`. Source: `../architecture/module-contract.md` Record types row, `DEC-39` as amended 2026-09-17. The scope form `solution:<id>` is owned by `../modules/solutions/README.md`, "Permissions and roles".

R-12. `can(user, 'solutions:use', solution)` returns true when the person or one of their groups holds a role carrying the key with a null scope or with a scope matching that solution. This holds from role assignment through navigation to a server-side refusal on the route and on every procedure. Source: `DEC-39`, `../core/roadmap.md` Section 4 item 2.

R-13. The workspace solution list is paged on `scopesFor(user, 'solutions:use')`. The procedure calls `scopesFor()` before the query and turns the result into a `WHERE` clause on the solution id, or applies no id filter when the result is `all`. The page size and the total count are computed from the filtered query, never by fetching a page and dropping rows. Source: `DEC-39`, `../core/roadmap.md` Section 4 item 2.

R-14. `can()` and `scopesFor()` read the person's assignments once per request through the shared lazy loader and answer every later call from that read. The module creates no loader of its own and caches no answer across requests. Source: `DEC-48`.

R-15. The module performs no permission check and builds no scope filter outside `can()` and `scopesFor()`. It owns no grant table. The Access overview reads `role_assignment` through core. Source: `../architecture/module-contract.md` "What a module must not do", `../modules/solutions/README.md` "Permissions and roles".

R-15a. The Access overview and the per-record access view are read-only views over core data. The Add access shortcut and the remove control both open the core role assignment form, with the role, scope, or existing assignment preselected, and that core form performs the write. The module never calls an assignment write itself, so core stays the one writer of `role_assignment` (`DEC-39`, `DEC-50`; decided by the product owner on 2026-09-18).

R-16. Administrator reach is a separate key and is not a scope. A holder of the module's admin key reaches every administration screen and may preview any solution, and that is not counted as member access anywhere. Source: `../modules/solutions/README.md` "Permissions and roles" and `DEC-27`.

### The streaming route pattern in core

R-17. Core provides the streaming route pattern as a reusable service, and the solutions module is its first consumer. Section 4 builds it in core, not in the module, even though only one consumer exists. The route mounts under the module endpoint prefix `/api/m/<id>/...` and is authenticated by the user session and `can()`, which is what separates it from the Inbound endpoints point, where a user session never authenticates. Source: `../architecture/module-contract.md` "What core provides to a module", Streaming, `../core/roadmap.md` Section 4 item 3, `README.md` "Section boundaries" row "Streaming route pattern".

R-18. The boundary between core and the module is fixed as follows.

Core provides, generic over any upstream event stream:
- Route composition. A route handler factory that a module mounts, receiving the tenant context, the Better Auth session, and the parsed body.
- Origin allow-list. Reads `GENIE_CHAT_API_ALLOWED_ORIGINS`, validates it at startup, exposes it as a fixed member of the tenant context, and refuses a call whose target origin is not in it.
- Destination safety. Public-host validation at call time, an undici `Agent` whose `connect.lookup` returns the address that passed the check, `redirect: "manual"`, and re-validation of a redirect target before it is followed.
- Connection control. Connect timeout, no-data timeout, per-event-line cap, and propagation of the client abort signal to the upstream request.
- The send lease. Acquire, extend under a throttle, and release, keyed by person and by a module-supplied resource id.
- Message stream emission. Construction of an AI SDK UI message stream response from the parts the module's mapper yields.
- Error mapping. A typed refusal to an HTTP status and a stable code, with upstream text kept in the log and never returned (`DEC-31` through `../core/roadmap.md` Section 0 item 10).

The module supplies:
- The request schema and the resource lookup.
- The authorization predicate, expressed as `can()` calls.
- The readiness predicate, which maps the record's status to a refusal or to permission to stream.
- The upstream request builder, which produces the URL, headers, and body.
- The event mapper, which turns one upstream event into zero or more message-stream parts and signals completion or failure.
- The persistence hooks that run at completion, guarded by the module's own version and generation columns.

Source: `../core/roadmap.md` Section 4 item 3, `../modules/solutions/chat-proxy.md` in full.

R-19. `GENIE_CHAT_API_ALLOWED_ORIGINS` is parsed and each entry validated at startup with the other environment values, so a typo fails the boot and not a request. An empty value disables the route for the deployment. Source: `../architecture/environment-contract.md` "Optional" and "Rules", `DEC-30`.

R-20. When the allow-list is empty the route refuses with 503 and the administration screens show the notice that chat solutions are not enabled on this deployment. The notice text and its placement are owned by `../design/sections/solutions/spec.md`, and the flag the screens read is `chatEnabled` in `../design/sections/solutions/types.ts`. Source: `DEC-30`, `../modules/solutions/chat-proxy.md` "Upstream call".

R-21. Origin membership and public-host resolution are checked at call time on every request, not only when an administrator saves the endpoint. Private, loopback, and link-local addresses are refused. The socket is opened to the address that passed the check. Source: `../modules/solutions/chat-proxy.md` "Upstream call", `DEC-30`.

R-22. A redirect is never followed automatically. The route reads the redirect target, runs the same origin and public-host checks against it, and only then issues the next request. A redirect chain has a fixed maximum, and exceeding it is a controlled failure. Source: `../modules/solutions/chat-proxy.md` "Upstream call".

R-23. Timeouts and caps are the values in `../modules/solutions/chat-proxy.md`, "Upstream call". This specification does not restate them. There is no total request timeout and no total byte cap, and the reason is recorded there. The upstream response must be 2xx with the expected content type or the call fails.

R-24. The no-data timeout is justified by the upstream heartbeat rule recorded in `../modules/solutions/chat-proxy.md`, "Upstream call", and in `OPEN-S1` of `../modules/solutions/README.md`. The route treats the upstream comment line as data for the purpose of the no-data timer and never forwards it to the browser as content.

R-25. The send lease is one conditional update where no unexpired lease exists, extended while the stream runs under a server-side throttle, and cleared in a `finally` block only when the owner still matches. The throttler instance is created per request, so one person's stream never paces another's. Values and the storage row are owned by `../modules/solutions/chat-proxy.md`, "Conversation model". Source also `../core/tech-stack.md`, Rate control row.

R-26. Refusals map to the HTTP statuses, stable codes, and client copy in `../modules/solutions/chat-proxy.md`, "Error mapping". This specification does not restate the table. Upstream error text and database error text stay in the log.

R-27. The browser never receives the upstream endpoint, the upstream record id, or the stored session handle. The request body carries only the identifiers named in `../modules/solutions/chat-proxy.md`, "Request". Source: `../modules/solutions/chat-proxy.md` opening paragraph.

R-28. The route emits an AI SDK UI message stream exactly as `../modules/solutions/chat-proxy.md`, "Mapping" states: one message start part, a text start part before the first text delta, a reasoning start part before the first reasoning delta, the end parts on completion, and the finish part carrying usage as message metadata. This specification restates no part name beyond what that section owns and adds no rule to it. The ordering rule holds because the AI SDK rejects a delta whose start part was never sent. Source: `../modules/solutions/chat-proxy.md` "Mapping", `../core/tech-stack.md` Chat rendering row, and the AI SDK 7 stream-protocol documentation checked on 2026-09-18.

R-28a. The route connects to the upstream and validates its status and content type before it commits its own response, so a connect timeout, a non-2xx, or a wrong content type still answers with the HTTP status of the error table. After the commit it writes an SSE comment line to the browser every 20 seconds while the upstream is silent, and a failure after the commit ends the stream with an error part carrying the same code and copy as the table, with `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` on the response, so an edge or a load balancer in front of the deployment never sees a silent response long enough to close it (`../modules/solutions/chat-proxy.md`, "Downstream keepalive"; `../runbooks/deployment.md`, "Before you start"). The integration test of AC-3 drives a silent stub upstream for longer than the keepalive interval and asserts the comment lines arrive on time, asserts a refused connect still yields a 502 or 504 status, and asserts a mid-stream failure yields an error part and not a second status.

R-29. Client rendering follows `../modules/solutions/chat-proxy.md`, "Rendering rules (client)". The renderer test cases listed there are the acceptance list for sanitization. This specification adds no rule and relaxes none. Both fenced-block renderers ship: Mermaid for `mermaid` blocks at its default `strict` security level, and Vega-Lite through vega-embed for `vega-lite` blocks with the actions menu off and URL data loading disabled, each loaded on demand only when a reply carries such a block, and each falling back to a plain code block on a parse failure (`../core/tech-stack.md`, "Web application", the two chat reply rows; decided by the product owner on 2026-09-18).

### Entitlement gating

R-30. With the module compiled into the image and `tenant_module.enabled` false, the module contributes no navigation entry, no administration screen, and no content security policy origin, and every module procedure and route refuses. The entitlement is read through the tenant context entitlement reader, which expires after 10 seconds, so a switch takes effect within that window without a restart. Source: `../core/roadmap.md` Section 4 item 4, `DEC-46`, `DEC-50`.

R-31. With the module excluded from `MODULE_INCLUDE`, its code, routes, migration files and client bundle are absent from the image, with no import anywhere in the build. On a fresh database, none of its tables or applied migration history are created. Core typechecks, boots and passes the smoke test without it. An existing deployment may exclude a formerly installed module only through the [controlled removal policy](../architecture/module-removal.md); its database then retains records and applied migration history. Until controlled removal is implemented and tested, that upgrade is rejected. Source: `DEC-33`, `../core/roadmap.md` Section 0 item 8 and Section 1 item 6.

R-32. Both gating forms go through the one core procedure that writes `tenant_module.enabled`, which the command line and the Modules page share. Source: `DEC-50` Guard.

### Cross-cutting module contributions

R-33. Only a full-document request to the server-owned embedded iframe-viewer route invokes this module's content security policy origin provider. It reads qualifying origins from its own records through the supplied tenant context; core validates and serializes the contribution before emitting the viewer policy. Which records qualify is owned by `../modules/solutions/README.md`, "Solution configuration". Entering the iframe viewer from the shell, hub, or another page requires full document navigation. The hub, directory, administration pages, chat viewer, chat stream, other API/tRPC responses, health, assets, and prefetch/RSC requests invoke no frame-origin provider and query no frame-origin records. Standard security headers remain universal, with the static frame restriction on non-viewer responses. Omitted, invalid, or failed contributions never broaden the policy. Source: `../architecture/module-contract.md`, Content security policy provider; Section 0 R-49/R-49a/R-50; Section 3 R-42.

R-34. The module declares the `solutions:feedback` event inside the module, not in `packages/core/contracts`, because no second module subscribes to it today. The event name, payload, and version are owned by `../modules/solutions/README.md`, "Chat behavior". A later module that subscribes moves the declaration into `packages/core/contracts` as `DEC-42` requires, and that move is the path that reopens it. Source: `DEC-42`, `../architecture/module-contract.md` "How modules talk to each other" channel 1.

R-35. A vote also writes an audit event through the core audit service. No feedback table exists. Source: `../modules/solutions/README.md`, "Chat behavior".

R-36. An administrator preview writes an audit event, is labeled in the interface, and is counted nowhere as member access: not in recents, not in favorites, not in the Access overview, and not in any access count shown on an administration screen. Source: `DEC-27`, `../modules/solutions/README.md` "Permissions and roles".

R-37. Categories are a core table with a core administration page. The module stores a reference to a core category id and reads the category through core. Deleting a category leaves the module's reference row in place and dangling by design, and every reader treats the missing category as no category. Core's Categories page counts members from `tenant_module.category_id` only and shows no solutions count. Source: `DEC-51`, `../architecture/data-shape.md` "Navigation".

R-38. Every administration action on a module record writes one `audit_event` row through the core audit service, and the module writes to no other core table. Source: `../architecture/data-shape.md` "Module tables" 4, `../architecture/module-contract.md` "What a module must not do".

### Tests and the second module

R-39. The module's tests run in the three layers through the shared presets in `packages/config` with no module-specific continuous integration configuration. The module ships unit tests, integration tests for its router and schema, factories for its tables, and at least one end-to-end test for its main path. Source: `../core/roadmap.md` Section 4 item 5 and Section 0 item 6.

R-40. A second, empty module generated with `nx g @genie/generators:module-new` mounts through the same registry with no change to any file in `packages/core` or `apps/genie` other than the generated registry file. Source: `../core/roadmap.md` Section 4 done-when, `DEC-22`.

R-40a. The generator `nx g @genie/generators:module-new` produces that second module, so the generator is the proof that a new module needs no hand wiring. A folder without a `README.md` fails continuous integration. Source: `../architecture/repository-layout.md`, the paragraph on folder readme files, `DEC-22`.

R-41. The standing two-context isolation test keeps passing with the module compiled in, and gains the module's router as a second real read beside the placeholder module's. Source: `DEC-34` enforcement point 3.

### Readiness gate on the external interface

R-42. The external chat API behavior recorded in `../modules/solutions/external-chat-api-contract.md` is a dated observation of 2026-06-30 with a source reading of 2026-09-17, not a verification of the production service. The route must not ship until a fresh capture confirms, against the production service the first deployment will call, all of the following: the transport and content type, the status lifecycle values, that a processing event's answer is an incremental delta and the completed answer is the full text, the heartbeat interval and the request lifetime that justify the no-data timeout, whether reasoning arrives as one value or several, the shape of an error event including the field that carries the message, whether authentication is now required, and whether a rate limit applies. A capture that contradicts the recorded contract is a change to that document before the route is built, never a change inside the route. Source: `../modules/solutions/external-chat-api-contract.md` opening paragraph, `../modules/solutions/chat-proxy.md` "Mapping".

R-43. If the revalidation finds that the external API requires a key, the key is a `tenant_integration.secret_ref` resolved at call time and is never a field on a module record. That path is already reserved. See the Proposal under Open questions for what it costs. Source: `../modules/solutions/chat-proxy.md` "Upstream call", `../architecture/data-shape.md` "Integrations".

R-37a. Solutions implements the optional category contribution declared in Section 0 and consumed by Section 3's single Categories page. `listAssignable` returns only authorized solution descriptors; assignment/clear validates the core category and changes `solution_category` inside Solutions, requiring `solutions:admin`, tenant isolation and current enabled state, with module-owned audit. Core never reads/writes this table. The central page additionally requires `core:settings:manage`. Disabled/excluded modules contribute no editable solution rows; retained placement and missing-category behavior follow R-9/R-37. Assignment never grants solution access.

## Acceptance criteria

AC-1 (roadmap item 1). With the module compiled in and enabled, an integration test proves the registry mounted it: its migration history is applied, its router answers under the module id, its permission keys appear in the role editor query, its default roles exist as system roles, and its navigation entries appear in the one tree under the categories that `tenant_module.category_id` and the entry `categoryId` values name. A repository test proves no file under `packages/core` or `apps/genie/src` other than the generated registry contains the module id. Proves R-1 to R-9.

AC-2 (roadmap item 2). An integration test grants a person a role carrying `solutions:use` scoped to one record, and proves three things in one run: the navigation tree shows that record and no other, `can()` refuses a procedure call for a record not granted, and the paged workspace list returns only the granted record with a correct total. A second run with a null-scoped assignment returns every record. Proves R-11 to R-15.

AC-3 (roadmap item 3). An integration test drives the core streaming service against a local stub upstream and proves: an unapproved origin is refused, a private or loopback address is refused, a redirect to an unapproved target is refused and one to an approved target is followed, a silent upstream past the no-data timeout ends with the mapped status, an over-long event line ends the stream with a controlled error, a second concurrent send is refused while a lease is held, a crashed stream frees the lease within the lease lifetime, and an empty allow-list makes the route answer 503. A unit test proves the emitted message stream opens and closes each text and reasoning block in order and carries usage on the finish part. Proves R-17 to R-28.

AC-4 (roadmap item 4, first form). With the module compiled in and `tenant_module.enabled` false, an end-to-end test proves a member holding the module's use role sees no navigation entry, and an integration test proves every module procedure and the streaming route refuse. Switching the entitlement on through the shared core procedure makes both succeed within the entitlement reader's expiry window. Proves R-30 and R-32.

AC-5 (roadmap item 4, second form). Against a fresh database, an image built without the module in `MODULE_INCLUDE` boots, answers `ok` on `GET /api/health`, passes typecheck and the smoke test, creates none of the module's tables, and answers 404 on the module's routes. Proves R-31.

AC-6 (roadmap item 5). Continuous integration runs the module's unit, integration, and end-to-end tests through the shared presets only. A configuration test proves no continuous integration file, Nx target, or Vitest configuration names the module. Proves R-39.

AC-7 (done-when, first clause). The module meets its own definition of done in `../modules/solutions/README.md`, "Done when", using only the points in `../architecture/module-contract.md`. The end-to-end suite runs that definition of done as written, at a phone viewport and a desktop viewport. Proves R-3, R-12, R-17, R-33.

AC-8 (done-when, first clause, contract purity). A review records that the module used no core capability outside the contract, and that no contract point was extended during the section. If a point was extended, the extension is in core, in `../architecture/module-contract.md`, and covered by a test in the placeholder module, all in the same change. Proves R-3, R-10, R-15, R-38.

AC-9 (done-when, second clause). A second, empty module is generated, added to `MODULE_INCLUDE`, and mounts through the registry with its navigation entry, its permission key, and its default role, with a diff that touches no file in `packages/core` and no file in `apps/genie/src` other than the generated registry. Proves R-40.

AC-10 (content security policy). Assert the Section 0 exact minimal CSP, with no nonce sources or default/script/style directives; the viewer changes only `frame-src`. At both viewports, an end-to-end test enters the real embedded iframe viewer from an ordinary shell/hub page and proves a full document navigation, only the owning provider invoked, qualifying record origins in `frame-src`, and locally controlled permitted iframe content visibly loaded. A nonqualifying record contributes nothing. After disabling the entitlement and allowing its reader cache to expire, a new document request contributes no module origin and refuses access; do not expect an already-loaded document's CSP to change without navigation. Provider failure or invalid contribution retains restrictive policy and blocks the controlled frame. Instrument provider calls and origin-record queries to prove zero for ordinary shell/hub/directory/admin pages, chat viewer/stream, API/tRPC, health, assets, and prefetch/RSC requests, while their standard headers remain present. An iframe load event alone is insufficient proof. Proves R-33 and R-30 and extends Section 0 AC-25 and Section 3 AC-4a.

AC-11 (feedback event). A unit test proves the event is declared inside the module and not in `packages/core/contracts`, that emitting it with no subscriber is a no-op that does not fail the request, and that a vote writes one audit row. Proves R-34 and R-35.

AC-12 (administrator preview). An integration test proves a preview by an admin-key holder writes one audit row, creates no recent and no favorite row, and changes no count on the Access overview. An end-to-end test proves the preview is labeled. Proves R-36 and R-16.

AC-13 (Categories interaction). An integration test deletes a core category that a module record references, then proves the module record is unchanged, the navigation tree places that record in the ungrouped area, and the Categories page member count never counted it. Proves R-37 and R-9.

AC-14 (landing route). An end-to-end test signs a person in and proves they land on the module entry marked the landing route, and that a person with no grants sees the shell no-grants empty state. A build test proves two modules carrying the flag fail the build. A second end-to-end run sets a category for the module on the Modules page and proves the same entry renders under that heading while the landing route is unchanged. Proves R-8 and R-8a.

AC-15 (isolation). The standing two-context test runs with the module compiled in and fails if any module code path reaches the wrong database. Proves R-41.

AC-16 (external interface readiness). A dated revalidation record exists, covers every item in R-42, and is filed before the streaming route is merged. Any contradiction it finds is recorded in `../modules/solutions/external-chat-api-contract.md` and, where it changes behavior, in `../modules/solutions/chat-proxy.md`, before the route is built. Proves R-42 and R-43.

AC-5a (existing deployment). Repeat the [removal lifecycle matrix](../architecture/module-removal.md) with real Solutions records, files and scoped/broad grants. Unauthorized omission is refused; when controlled removal is supported, no routes/code remain in the image but retained records survive, reintroduction stays disabled, and review plus explicit enable restores only valid remaining access. Proves R-31 and CF-MA-10–11, not the fresh-database AC-5 alone.

AC-13a (R-37a). Real-database tests prove assignment, reassignment and clear through the contribution, category validation, both required permissions, cross-tenant denial, disabled-module refusal, retained placement, and the owning audit event. Phone/desktop E2E prove one Categories page can assign a whole module and a solution to the same category, show per-row failure/retry and reflect navigation placement without changing grants or module-only category summary counts. No special-case core Solutions import/table access is introduced. See `../flows/categories-and-settings.md`.

## Verification

CSP scope verification uses the actual built application's response paths and provider/query instrumentation under AC-10. It covers shell-to-viewer document navigation and actual controlled frame rendering, as well as zero frame-origin work on chat and every listed non-viewer path. Reuse Section 0's restrictive-policy failure fixtures; do not broaden provider execution to ordinary responses to obtain header coverage.

Unit tests, Vitest through the shared preset: the event mapper against recorded upstream event fixtures, including a delta that splits markup, a cumulative reasoning value, a missing completion, and a populated error field. The message-stream part ordering. The sanitization cases listed in `../modules/solutions/chat-proxy.md`, "Rendering rules (client)". The origin and public-host validators, including a redirect target. The record-type resolver. The lease throttler creating one instance per request.

Integration tests, Vitest against a real Postgres through Testcontainers with the real migration histories, never a mocked database: `can()` and `scopesFor()` over seeded assignments at record scope and at tenant scope, the paged list and its total, entitlement gating through the shared core procedure, default role seeding idempotence, lease acquisition and release including a crashed holder, the persistence guard on version and generation, the dangling category reference, and the audit rows for administration actions, votes, and previews. The streaming service runs against a local stub upstream, not against the external service.

End-to-end tests, Playwright against one seeded deployment, every test at a phone viewport and a desktop viewport (`DEC-25`): the landing route after sign-in, the module's own done-when path from `../modules/solutions/README.md`, the server-side refusal for a person without the grant, the entitlement switched off, the response headers on a page that renders an external frame, and the axe accessibility checks the design tree requires (`DEC-21`).

Manual checks, where no automated layer fits: the external interface revalidation of R-42 against the production service, recorded with its date and its captures. A review of the diff for AC-9 to confirm no core file changed. A review that confirms the module added no dependency without a matching row in `../core/tech-stack.md`.

## Deferred

- A second consumer of the streaming service. The service is built generic in this section because the roadmap requires it, and the second consumer is a customer module after its discovery closes. Trigger: the first customer module that relays an upstream event stream.
- Moving `solutions:feedback` into `packages/core/contracts`. Trigger: a second module subscribes to it (`DEC-42`).
- A core Dashboard page and a landing-slot contract point. Trigger: a second widget with requirements (`DEC-49` Guard).
- Transcript storage and visible history on reopen. Trigger: the revisit line of `DEC-27`.
- A `tenant_integration` reference on a chat record for upstream authentication. Trigger: the revalidation of R-42 finding that a key is required.
- Widening a record's category reference to many-to-many. Trigger recorded in `../modules/solutions/README.md`, "Tables".
- A third solution type, theme presets, custom theme CSS, attachments, and a status-page link. Recorded as not built in `../modules/solutions/README.md`, "What it does" and "Defaults".

## Assumptions

- The module's package layout follows `../architecture/repository-layout.md` exactly, with the streaming route handler composed in `apps/genie/src/app/api/` from the core factory and the module's supplied parts. Rationale: the layout file already lists a chat stream under the app's api folder and forbids a module from assuming a shell. Consequence if wrong: the route moves, and the core and module boundary of R-18 does not change.
- Verified on 2026-09-18 with the Context7 documentation tools. AI SDK 7 UI message stream: a text block is `text-start`, then `text-delta` carrying `delta` and the block id, then `text-end`, and a reasoning block is `reasoning-start`, `reasoning-delta`, `reasoning-end`. A delta whose start part was never sent raises a stream error. The message lifecycle opens with a `start` part. The `finish` part carries a finish reason and message metadata, and usage is attached as message metadata. A route handler builds a custom stream with `createUIMessageStream` and returns it with `createUIMessageStreamResponse`. The drafting round found `../modules/solutions/chat-proxy.md`, "Mapping" in conflict with all of this. That section has since been corrected at its source and now matches, so R-28 cites it rather than working around it. Consequence if a future AI SDK major line changes the part names: R-28 changes with the module document, and nothing else in this specification moves.
- Verified: Streamdown exposes `urlTransform` and a hardening plugin with allowed link prefixes, allowed image prefixes, allowed protocols, and a switch for data images, which is enough to express every rule in `../modules/solutions/chat-proxy.md`, "Rendering rules (client)". Mermaid rendering is a separate Streamdown plugin package. Consequence: the rendering rules are implementable as written.
- Verified: undici accepts a custom `lookup` in its connect options, which is what pins the connection to the validated address, and a custom dispatcher is passed to `fetch` as `dispatcher`. Verified by web search: undici's `fetch` with `redirect: "manual"` returns the 3xx response itself with the location header readable, which is what R-22 needs and is a server-side deviation from the browser behavior. Consequence if wrong: the proxy would need a lower-level undici client, and R-21 and R-22 would not change.
- Assumed, not verified: that passing a custom dispatcher through the framework's patched global fetch is reliable. The route therefore imports `fetch` from undici directly. Consequence if the assumption is unnecessary: one import changes.
- Verified: TanStack Pacer ships a framework-agnostic throttler usable outside React, which is what the server-side lease throttle in `../modules/solutions/chat-proxy.md` needs. Consequence: R-25 is implementable as written.
- Verified: a Next.js App Router route handler streams by returning a `Response` built from a `ReadableStream`, and the documented server-sent-events example uses exactly that. The accepted minimal CSP adds no nonce or blanket dynamic-rendering requirement; real viewer policies remain request-bound and chat viewer/stream requests perform no frame-origin lookup.
- Not verified: iframe `sandbox` behavior under Next.js 16 specifically, because sandbox is a browser feature and the framework does not change it. The attribute values are owned by `../modules/solutions/README.md`, "Solution configuration". Consequence: none.
- Assumed: an administrator preview of a record whose status is maintenance or down does not stream, because `../modules/solutions/chat-proxy.md`, "Request" allows only ready, or draft for a preview. `../modules/solutions/README.md` and `../design/sections/solutions/spec.md` say a preview is available and labeled for every status, which this reading keeps: it opens for every status and streams only for the two named. Consequence if wrong: one predicate in the module's readiness check changes.
- Assumed: `frame-src` receives the origin of a qualifying record's URL, not the full URL, matching the content security policy directive's usual form. Consequence if wrong: the header is narrower than intended and a frame is blocked.
- Established reading, not an assumption of this specification: the unauthenticated health endpoint is `GET /api/health` and returns `ok` or `degraded` and nothing else, and HTTP 503 while the database is unreachable (Spec 1 R-11, amended 2026-09-23). AC-5 uses it as the boot check for an image built without the module. Source: `README.md` "Cross-section calls made in the drafting round", Health endpoint row.
- Assumed: the module's default roles are seeded by the same Section 2 mechanism that seeds every module's default roles, and Section 4 adds no seeding code. Consequence if wrong: Section 4 grows a core change it is meant not to have.
- Assumed: the placeholder module stays compiled in development and continuous integration images and is never compiled into a customer image, per `../specs/README.md`, "Terminology", so AC-9 uses a newly generated module rather than the placeholder. Consequence if wrong: AC-9 uses the placeholder and proves less.

## Open questions

Former Proposal 1 (R-29) was decided by the product owner on 2026-09-18: both renderers ship, and the two libraries now have rows in `../core/tech-stack.md`.

Former Proposal 2 (R-15a) was decided by the product owner on 2026-09-18: the remove control opens the core role assignment form, which performs the removal. No proposal remains open in this specification.

Not a proposal, recorded for the coordinator.

- `OPEN-S1` in `../modules/solutions/README.md` is closed and is not reopened here. The heartbeat and request-lifetime values it records are part of what R-42 revalidates before the route ships. Does not block drafting. Blocks merging the route.
- Resolved during the integration pass and no longer open: the message-stream part ordering and the usage metadata in `../modules/solutions/chat-proxy.md`, the streaming route's path and its session authentication in `../architecture/module-contract.md`, the two design type fields that had no column, and the placement of the hub entry when a category is set, which `README.md` settles in favor of the picker with the landing-route flag independent of placement.

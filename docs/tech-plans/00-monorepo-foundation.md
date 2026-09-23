# Spec 0 technical plan

Confidence: 8.0/10. Requirements and foundation decisions are explicit, with bounded tests for the difficult integrations. The exact startup/header composition remains unproven; pinned Storybook compatibility has integrated G1 evidence. Later production integration is still unproven and may require a revised decision before implementation proceeds.

Status: approved by the product owner for ticket breakdown, 2026-09-19. See the [ticket dependency map](../tickets/spec-0/README.md). Implementation is underway: S0-01 and G1/S0-02 are integrated and accepted; G2 and later gates remain unproven. See [integrated G1 evidence](../tickets/spec-0/02-storybook-compatibility-g1/integrated-acceptance.md) and live Beads status. This plan supplements [Spec 0](../specs/00-monorepo-foundation.md), not a replacement for its numbered requirements.

## Scope and decision authority

Deliver the workspace, import boundaries, typed module extension points, placeholder, tenant-context factory, generated registry, migrator, generators, image, four test layers, development tooling, i18n scaffold, logging/errors, security headers and CI. No production business screens are pulled forward from later sections.

| Accepted direction | Authority |
| --- | --- |
| Native-first runtime integration; stop before infrastructure expansion | [ADR 0008](../adr/0008-foundation-integration-and-generated-registry.md), R-17–R-19b |
| Generated/gitignored registry and shared build-time selection resolver | ADR 0008, R-3a/R-21/R-22 |
| One minimal Storybook host; early pinned-version gate | ADR 0008, [UI development](../architecture/ui-development.md), R-41a–R-41e |
| Minimal enforced CSP; viewer-only origins; no nonces | [DEC-31](../core/decision-log.md#dec-31-platform-hardening-defaults), R-47–R-50 |
| Local caching only; remote provider deferred | R-3/R-3a, AC-24/AC-28 |
| Dedicated migration session across all histories | R-24–R-28, AC-9 |
| Module-owned factories, app-owned composition tests | R-20/R-39 |
| Standard tRPC envelope with additive appCode/requestId | R-46, AC-15 |
| Categories/Settings extension declarations only | [Module contract](../architecture/module-contract.md), R-56/AC-29 |

## Delivery order and early gates

These are dependency stages, not tickets. Build only enough foundation to exercise a gate, prove it, then expand. No installed versions or runtime results are claimed here.

## Naming revision, 2026-09-20

Apply [the canonical module naming contract](../architecture/repository-layout.md#module-package-naming): independent `@genie/module-<id>` packages live in `packages/modules/<id>/`, with unchanged kebab-case IDs. See [the propagation and rework plan](module-naming-revision.md) before resuming implemented tickets; this revision does not authorize code changes or invalidate unrelated historical evidence.

## Build ownership and dependency graph

The names below are planned target responsibilities, not claims that targets already exist. Build-time tooling owns selection; product runtime never imports it. The shared resolver lives under `tools/generators` with a build-safe entrypoint, not in `packages/config` or a runtime module barrel.

The resolver reads a data-only module inventory (package metadata or a non-executable manifest containing module id and entrypoint path strings). It never imports or evaluates module declarations, application runtime, database drivers or executable configuration to discover modules. Entrypoint strings are validated data for emitting imports, not instructions for tooling to load them. The authoritative `Module` declarations remain in their owning modules; metadata does not duplicate permissions, routes or other runtime contracts. App-owned validation checks selected metadata against actual declaration identity and typechecks the generated registry without initializing deployment services. Fail on missing entrypoints, duplicate ids or identity mismatch. Unselected modules are not imported for validation. Before selection/cache lookup, validate every discovered module package's metadata: its folder basename must be `<id>` and its package name `@genie/module-<id>`. Workspace validation must enforce the same rule so arbitrary package names cannot bypass name-based import restrictions. Share this data-only invariant; keep path-based architectural classification separate. Preserve custom declaration entrypoints and consume validated inventory paths instead of reconstructing paths from IDs.

| Owner / producer | Input and declared output | Required consumers / edges |
| --- | --- | --- |
| Tooling selection resolver, invoked by development/CI/customer wrappers before Nx starts | Reads `MODULE_INCLUDE`, or the customer wrapper's `modules.txt`, plus data-only module inventory; resolves an explicit ordered list and source mode (unset default versus explicit, including empty). Produces a canonical serialized selection and deterministic fingerprint of that value. Rejects unknown ids. | Pass the resolved value/fingerprint as declared task inputs before cache lookup. Include resolver source, data-only inventory and any source `modules.txt` in invalidation. Do not first resolve inside a cached consumer. |
| App-owned `generate-registry` target, invoking data-only tooling and app-owned validation | Tooling consumes resolved selection and inventory to emit import text; only app-owned validation may inspect selected module declarations for identity/type checks. Sole writer of the declared output `apps/genie/src/modules.ts` within the isolated build root. | App `typecheck` and `build` depend on successful generation/validation; `image-prep` depends on generation and app build. Include selected declaration sources in these targets' cache inputs without importing them into tooling. All carry selection inputs themselves, not merely an ordering edge. Cache restoration must restore the selected registry before consumption. |
| Storybook host discovery, then `storybook`, `build-storybook`, `test-storybook` | Consumes the same pre-Nx resolved selection through the build-safe resolver contract; discovery is host-owned configuration, not another runtime registry. `build-storybook` declares its isolated static output directory; component tests declare their reports. | Discovery precedes story collection for all three targets; build/test hash the selection plus actual story-owner/source/fixture/config dependencies. No dependency on app `generate-registry` or import of `src/modules.ts`. Serve/watch is not cacheable. |
| App-owned `image-prep`, followed by image build | Produces a declared isolated staging directory containing only selected runtime inputs and migration histories; image build consumes that directory and app output. | Registry generation → app build → image preparation → candidate image → smoke verification. Keep `MODULE_INCLUDE` the only Docker build argument; the fingerprint is task metadata, not another Docker argument or runtime environment setting. |
| Release wrapper / publish operation | Consumes the exact smoke-tested candidate image. | Smoke verification must succeed before publishing. Publishing is non-cacheable and separately authorized; no cache hit may skip the smoke gate and trigger publication of a different image. |

There is no mutable repository-global selection file shared by concurrent builds. Customer wrappers allocate isolated workspaces/output roots or container contexts; each invocation passes its selection consistently to all consumers. Direct supported developer/Nx entrypoints must establish the same pre-hash selection inputs or refuse to run without them. The serialized value, not the fingerprint alone, is the source of selection truth; preserve unset/explicit identity even when their effective lists happen to match. Do not reorder a supplied list silently, since it also determines registry order.

At G3, inspect the resolved task graph and test each edge: missing generated output from a clean checkout, cached registry restoration, changed selection/file contents, identical-selection reuse, Storybook invalidation and isolated concurrent customer builds. A producer dependency without consumer cache inputs is insufficient. No new service or general-purpose orchestration framework is introduced.

Extend the import-boundary negative fixtures to reject resolver imports of module/application runtime and database drivers, including package subpaths and relative spellings. A resolver test uses valid data-only metadata pointing to a module fixture that throws if evaluated: selection resolution must succeed without evaluating it. Separately, app-owned validation must fail selected metadata/declaration identity mismatches. Reading source bytes for cache hashing is not permission to execute them. These are required future tests, not tests run during planning.

### 1. Establish the toolchain and compatibility slice

Pin the canonical toolchain after checking current official documentation and peer dependencies. Establish pnpm/Nx, six classification tags, shared configuration, lint/format hooks and test entrypoints. Prove positive and negative import fixtures, including relative paths and package subpaths. Adopt reviewed anti-slop rules with provenance and justified exceptions; no Effect adoption or experimental Nx bridge is implied.

Bring up the single Storybook host with representative UI and placeholder stories. Use Next.js/Vite and official Nx serve/build inference; one Vitest-addon target owns component execution. UI/Core/Modules grouping must not require importing server modules. Docs, accessibility and MCP requirements remain mandatory. Prove dev startup, static build, CLI and in-UI tests, local agent connection, meaningful interaction/a11y failure propagation and nonempty separate unit/component collection. Do not implement later feature screens to populate the catalogue.

**Gate G1:** record exact versions and resolved task ownership. If incompatible, report the constraint; do not silently downgrade, omit an addon, introduce duplicate runners or rewrite product boundaries to accommodate stories.

### 2. Prove runtime startup and header ownership together

**Permanent prerequisites, after G1 and before G2:** establish a thin production vertical slice using the final interfaces, not a disposable bootstrap spike:

- The data-only selection resolver and app `generate-registry` target above, initially exercised with the placeholder selection; app-owned validation of the selected build-safe declaration and the unchanged authorization stub. Tooling never imports that declaration.
- Runtime-only environment validation, the core context factory and app-owned context access seam; real page, tRPC, health and placeholder viewer routes needed by AC-25/AC-26.
- The final dedicated-session migrator over the minimal core migration-history scaffold and real placeholder history, including lock/timeout/cleanup behavior. Do not invent Section 1 deployment tables merely to populate core history.
- A minimal version of the one production Dockerfile and app entrypoint, building without runtime secrets/services and using those same registry/context/migrator paths. No alternate test server, hard-coded registry or bypass migration runner.
- The browser/header instrumentation, controlled iframe fixture and real database fixtures required for the G2 assertions, including the mandatory two-context isolation test referenced by AC-26. Fixtures are disposable; the production paths they exercise are retained.

G2 consumes this slice. G3 broadens selection/cache/concurrency and database verification using the same paths; G4 completes contracts/generators and developer workflow; G5 completes customer-image breadth and release CI. Work that depends on the startup/header mechanism cannot proceed past G2 without its recorded successful disposition or a newly approved decision. Independent contract declarations need not wait for that disposition.

Keep declarations/environment schemas build-safe. The app owns `src/context.ts`; core exports the factory only. Runtime bootstrap validates applicable configuration before any DB connection, creates one context, awaits migration completion and then permits request-bound handling. A failed validation/migration exits nonzero.

Startup ordering amendment, 2026-09-21, approved after the G2 verification experiment: validation precedes every database connection, and successful migrations precede request-bound handlers, page rendering, tRPC operations and viewer-provider execution. Early socket binding and connection acceptance are permitted, because the supported server binds before it initializes. Readiness is a successful designated HTTP health response, not transport connectivity and not a framework ready log line. Bootstrap failure exits nonzero within one total budget covering diagnostics, cleanup and logger flushing. A client timeout does not cancel a queued request. Canonical wording is in R-19b and AC-26; measurements are in [the spike report](../tickets/spec-0/05-production-startup-and-csp-g2/native-composition-spike.md). Later setup-state gating must not be confused with schema readiness.

Evaluate the native startup hook as the first candidate. Test the built image, not just a helper: deployment variables and services absent during build; invalid runtime configuration before connection; delayed/failed migration before listening; concurrent page/tRPC/viewer requests reuse one context/pool. A separate migration subprocess alone does not prove application context reuse.

Core owns a pure CSP serializer; modules supply validated origins only. The app must select one final CSP emission path per response class through framework-native mechanisms. Identify the actual composition point in the gate evidence; do not assume Proxy and page bundles share module-local state. No incoming client header may select a module or supply trusted policy origins. Static header coverage and viewer replacement must not produce two competing enforced CSP policies.

Ordinary responses use exactly `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'`. Only a server-mapped viewer document replaces `frame-src` using its owning provider and existing tenant context. That mapping is an exact route mapping, never a path prefix, so a non-route path under the viewer prefix keeps the deny baseline.

Header coverage amendment, 2026-09-21: the framework answers a repeated-slash or backslash path with a 308 normalization redirect before any header mechanism runs, and no option disables it. Those responses are a narrow exception, asserted rather than ignored, and nothing else is excluded. The application sets `skipTrailingSlashRedirect` so both spellings of a route are ordinary responses with full coverage. Application-generated redirects keep complete coverage. Public HTTPS header verification remains in deployment acceptance through the required TLS reverse proxy, and any later edge policy must preserve the single viewer-derived policy rather than overwrite it or add a conflicting one. Empty/invalid/failing providers deny frames. No origin work occurs on ordinary pages, APIs, chat, health, assets or prefetch/RSC paths. Full-document viewer entry remains required. Tenant-specific rendering isolation remains, without a CSP-driven blanket PPR/static-rendering ban.

**Gate G2:** satisfy AC-25/AC-26 with response/path instrumentation, context construction counts and real browser frame-content assertions. Also prove positive hydration/styles and the negative frame/object/base-URL cases in R-50. Stop if the native mechanism requires a custom server, extra pool, internal HTTP workaround or substantial synchronization. Present the failed proof and alternatives; do not weaken the invariant.

### 3. Complete selection, registry and database foundations

Extend the permanent G2 slice; this stage does not introduce the first working registry or migrator. Preserve the ownership and dependency edges above while expanding the fixture matrix.

Resolve module selection before Nx cache lookup. Commit declarations, generator and selection inputs, never `src/modules.ts`. Generate deterministically before consuming builds/typechecks. Storybook uses the same build-time resolver but never the runtime registry. Unknown ids fail; unset and empty remain distinct. Separate customer build roots/container contexts prevent concurrent overwrite.

Declare selection-dependent inputs/outputs and preserve ordinary source/dependency inputs when configuring targets. Run AC-24 and AC-28 with two explicit selections, identical-selection reuse, changed `modules.txt`, unset and empty cases. Inspect output content, not only cache-hit labels. Local cache correctness is mandatory; remote caching is disabled. Publishing is never a cached side effect.

Core then included-module migration histories run under one fixed advisory lock on one reserved client. Lock setup, acquisition, migration ledger operations, histories and unlock stay on that session; retain ownership across history transactions. Timeout, connection loss and uncertain cleanup fail startup. Roll back active work before unlock; reset the session or destroy the client if unsafe. No automatic schema rollback across already completed histories is promised; preserve forward-only/expand-then-contract compatibility.

**Gate G3:** clean-checkout deterministic registry generation, fresh-image module exclusion, same-session migration proof, concurrent migrators, timeout/failure cleanup and idempotent rerun pass. The app-owned two-context integration test uses two real disposable databases and module-owned factories and must actually run.

### 4. Finish the foundation contract and developer workflow

Complete module declarations and generator coverage, including optional Categories writes and Settings discovery metadata without their later runtime services. Keep the original placeholder's permission stub unchanged. Generated modules prove registration/schema and denied router/browser paths; real-role success arrives in Section 2. A disposable generated UI module proves automatic story discovery and story-first tests without a host or CI edit.

Finish development-only devtools, i18n and root scripts under shared presets, required documentation and import checks. Implement the shared safe error catalogue with separate ordinary-HTTP and standard-tRPC adapters, plus redacted structured logs. No raw database/upstream errors reach clients. Every UI slice follows the documented story-first TDD workflow before app consumption; database integration and deployment E2E remain separate.

**Gate G4:** AC-1–AC-15 and AC-23/AC-27–AC-29 pass where applicable, together with the earlier gates. Prove failures propagate through Nx/CI rather than relying on empty successful runs.

### 5. Close image and CI acceptance

Complete the one secret-free image introduced before G2, extending it to every required selection with only selected modules, histories and runtime assets. Exclude Storybook, stories, fixtures and development dependencies. Prove module exclusion at the build input (`pg4`, 2026-09-23). The Docker context stays the repository root. In the builder stage, before `pnpm install` and `next build`, a step resolves the `MODULE_INCLUDE` selection with the dependency-free resolver in `tools/generators/src/selection`, removes every `packages/modules/<folder>` not in it, then checks that the remaining `packages/modules/` folders equal the selection and fails the build otherwise. The check exists because a frozen install passes and only leaves a dangling link when a listed module folder is missing. A module package is a folder under `packages/modules/`, so fixture templates elsewhere (`apps/genie/tools/fixture-modules`, generator `__fixtures__`) are out of scope. The AC-25 fixture image still builds, because the prune removes `placeholder` when only fixtures are selected. The builder stage is discarded, and only `.next/standalone` reaches the runtime image. Tests prove that a direct import of an excluded module, including a subpath import, fails the build, that a control without the import passes, and that the check fails when an unselected folder remains. Only the excluded-module code needles over built chunks leave the image scan, because the bundler output does not preserve package origin. The scan keeps its secret checks, the `MODULE_INCLUDE`-only build-argument check (R-32), the development-tooling check (AC-28) and the excluded-migration-SQL check (AC-17). Runtime dispatch implements the app path only; worker/CLI execution arrives in Section 1. Customer selection is explicit and may be empty.

Wire the Spec 0 PR/merge/release gates. Smoke the actual candidate image before pushing: development image proves placeholder behavior; customer image proves health and absence of excluded routes/tables/migration files without requiring placeholder. With no customer folders, use the development fallback, never label it a customer deliverable. Publishing occurs only in the authorized release workflow, not while implementing/testing this plan.

**Gate G5:** AC-16–AC-22 and all remaining Spec 0 acceptance criteria have recorded evidence. Include phone/desktop E2E, response coverage, builder-stage prune and check, failing-import tests, image secret, build-argument, development-tooling and migration-SQL inspection and failure-path assertions. Passing Storybook is not deployment proof.

## Later-section compatibility and exclusions

- Section 1 adds deployment tables/readers, setup, worker, CLI and module reconciliation. Preserve per-process contexts, 10-second readers and pre-setup serving; do not implement them here.
- Section 2 adds real identity/authorization and generated-module authorized success tests. Do not broaden the placeholder stub to simulate completion.
- Section 3 delivers the shell, primitives, Categories and Settings runtime. Preserve mixed module/record Categories and metadata-only permission-filtered Settings search through typed declarations.
- Section 4 supplies Solutions and real embedded/chat paths. Viewer-only CSP must not create origin queries for chat streams.
- Module removal/reintroduction and permission evolution remain governed by their existing contracts. Fresh-image exclusion is not authorization to drop installed-module data.
- Design files are references, not production components or runtime proof. No design import or unresolved later product decision is decided here.
- Remote caching, strict script/style CSP and report-only evaluation remain deferred. No new hosted service, custom server, generic orchestration layer or later business feature is implied.

## Stop conditions and handoff evidence

Stop and seek a revised decision when a gate requires a major dependency change, new service, extra context/pool, cross-module import, authorization weakening, retained-data deletion, customer artifact exposure or the infrastructure expansions listed in G2. Record the failed command/scenario, exact versions, observed behavior and smallest alternatives. Do not hide a failed gate with skipped tests or mocked runtime acceptance.

For each completed gate, later implementation records commands, versions, relevant output and remaining limits. The linked ticket breakdown preserves G1/G2 as early dependencies, not postponed until final release. Planning approval certifies no implementation.

## Unresolved implementation questions

1. Resolved 2026-09-21 for mechanism selection only. The framework bootstrap hook plus a process-global application context seam, universal baseline headers from the header configuration and a viewer-only override in the proxy file, was measured and selected, together with the startup and header amendments above. Selection is not acceptance: G2 stays open until the actual built image passes the amended acceptance matrix with real database and browser proof.
2. Does the full pinned Storybook/Nx/Vitest/MCP and lint-plugin combination work? Resolve at G1; documented version floors are not proof.

Assumptions: no later feature is needed to prove the placeholder foundation; runtime hooks remain candidates until built-image evidence exists; the spec and design approvals remain separate from approval to draft this plan.

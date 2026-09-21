# S0-05 — Prove production startup, one context and minimal CSP (G2)

Bead: `genie-ops-center-v2-1rd.5`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-19–R-23a, R-32/R-33/R-35/R-36/R-36a, R-40, R-46–R-50; AC-4/AC-11/AC-15/AC-16/AC-23/AC-25/AC-26; plan Stage 2/G2 and ADR 0008.

## Dependencies and worktree ownership

Hard prerequisites: [S0-04](../04-context-migrator-and-placeholder/index.md) and `genie-ops-center-v2-5ph`. Deliver child `yt2` within S0-05 before closure.

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: apps/genie composition/context/registry targets, minimal deploy/Dockerfile and app entrypoint, app-owned two-context and built-image/browser fixtures.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Implement app-owned generate-registry using data-only tooling; generated gitignored modules.ts sole writer and selected-declaration identity/type validation; selected declarations import safely, unselected never evaluated. Typecheck/build depend on generation with declared selection inputs.
- Retain one minimal production Dockerfile/entrypoint: secret/service-free build, applicable env validation before connection, one app context, migrations complete before any listening/health. Native-first hook is a candidate to prove, not an assumed mechanism.
- Wire real page, tRPC, health and placeholder viewer paths through the same initialized context. Compose the app-owned two-real-database isolation test using module factories. Render simple unfiltered navigation, no Section 3 shell.
- Emit all five security headers on every specified response class with one final CSP. Ordinary baseline exactly base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'. Viewer alone replaces frame-src through trusted route mapping and owning provider; full document navigation.
- Add ordinary HTTP and standard tRPC error adapters using shared catalogue; data.appCode/data.requestId and safe message preserve protocol codes. Integrate English messages for every introduced user-facing string.
- Record G2 runtime/header composition, instrumentation and pass/fail evidence on actual built image.

## Acceptance and tests

- AC-26: clean uncached build without deployment env/services; malformed runtime config exits before DB/listener; delayed/failed migrations block listening; concurrent page/tRPC/viewer requests reuse one context/pool across real framework bundles; same image uses second runtime config.
- Mandatory two-context isolation test executes against two real databases. Phone/desktop placeholder main path and axe baseline execute.
- AC-25/R-50: ordinary/API/tRPC-error/health/redirect itself/404/JS/CSS/public asset headers, zero origin-provider calls outside viewer including prefetch/RSC. Exactly one CSP, no default/script/style directives/nonces.
- Controlled frame visibly loads only permitted viewer origin. Deny ordinary iframe, unlisted viewer origin, framing the app, object and foreign base URL; failed/invalid provider keeps deny policy; hydration/styles still work.
- Standard tRPC client decodes safe correlated errors; raw causes/stacks/upstream/database text never reach either transport.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No custom server, extra context/pool, internal HTTP workaround, strict nonce CSP, report-only subsystem, real shell/auth/chat or worker execution.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G2 BLOCKER: no downstream runtime-dependent ticket starts before integrated passing evidence. Stop if native integration needs custom server, extra pool, internal HTTP or substantial synchronization. Separate migration process alone is not context-reuse proof.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Generate registry/app imports from validated inventory packageName/packageRoot/entrypoint, preserving ID-based runtime behavior. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The naming convention and rework sequence are approved; follow current prerequisite acceptance and ticket-specific execution authority. Later consumer proof remains required.

## Develop audit, 2026-09-21

Develop has only an app skeleton: no production Next build/start, registry target, context composition, image or transport/header harness. Consume accepted S0-03 contracts and integrated S0-04 runtime. Entrypoint hardening (5ph) is a pre-G2 prerequisite. CSP provider failure logging (yt2) is an owned child delivered inside this ticket, not a separate prerequisite session. Preserve the pure CSP helper and denied policy; prove redacted correlated logging through the actual viewer path. Include by-name placeholder imports and actual TSX/page mounting; Node resolution alone is insufficient. The first real Tailwind consumer supplies preset-consumption proof (3yv), using actual compile behavior, not object-shape assertions.

See the [whole-ticket audit](../audit-2026-09-21.md) for evidence and auxiliary dependencies. This update starts no implementation and closes no acceptance gate.

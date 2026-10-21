---
status: accepted
date: 2026-09-19
---

# Foundation integration stays native-first and generated outputs stay uncommitted

The platform foundation uses framework-native startup and header integration first, one development-only Storybook host, and a build-generated module registry. These choices avoid introducing custom infrastructure before the production integration has been tested. Acceptance of the approach is not proof that a particular framework hook satisfies it.

## Runtime integration

An explicit runtime bootstrap validates the selected entrypoint's configuration, constructs its application-owned context once and completes migrations before accepting traffic. Imports and builds must not initialize runtime services. Evaluate the framework startup hook first, but a promise of running before request handling is not evidence of migration completion before listening. Prove the actual production lifecycle and context reuse across pages, tRPC and viewer policy generation. Worker and CLI contexts remain separate, process-local owners when Section 1 introduces them.

If the native approach cannot meet those requirements without a custom server, extra pool, internal HTTP workaround or substantial synchronization, stop and obtain a revised decision. Do not silently weaken the startup ordering or the single-context requirement. Exact hook and header composition placement remain an early implementation verification gate.

### Amendment, 2026-09-21: startup ordering

The verification gate ran. Its measurements are in [the native composition spike](../tickets/spec-0/05-production-startup-and-csp-g2/native-composition-spike.md).

The supported server binds its socket before it initializes and gates request handling behind an initialization promise. No configuration option changes that order. The original phrase "before accepting traffic" is therefore replaced.

The amended ordering requirement is: environment validation precedes every database connection, and successful migrations precede request-bound handlers, page rendering, tRPC operations and viewer-provider execution. Early socket binding and connection acceptance are permitted, including before invalid configuration is detected. Readiness is a successful designated HTTP health response. A bootstrap failure exits nonzero within one defined total budget covering diagnostics, cleanup and logger flushing. A client timeout does not cancel a queued request.

The framework bootstrap hook is the selected mechanism. Two alternatives were considered and are recorded rather than dismissed. A custom server remains out of scope. A same-process wrapper or preload that initializes before the framework binds is technically possible and was not ruled out, but it needs its own packaging and shared-context proof, and it is not required while the amended ordering holds.

This amendment selects a mechanism. It accepts no implementation. R-19b and AC-26 carry the canonical wording.

## Generated registry

`apps/genie/src/modules.ts` is generated and gitignored, never committed or hand-edited. Commit module declarations, selection inputs and generator logic instead. Generation is a prerequisite for consumers; clean-checkout CI proves deterministic generation and correct selection, not agreement with a committed generated file. Repeating the same inputs produces identical output. Different customer builds use isolated workspaces/output roots or container contexts so concurrent generation cannot overwrite another selection.

One small build-time selection resolver supplies application registry generation and Storybook discovery. It distinguishes unset from explicitly empty selection, rejects unknown ids and resolves selection before cache lookup. It must not import the runtime registry or initialize deployment services.

## Storybook integration

Use one `apps/storybook` host, official Nx serve/build inference and one explicit Vitest-addon test target where needed. Do not add a second legacy runner or custom orchestration. Prove the pinned combination early with representative UI/placeholder stories and a disposable generated module; later business features populate their own stories. The detailed contract, required Docs/a11y/MCP tooling and story-first TDD remain in [UI development](../architecture/ui-development.md).

## Related accepted decisions

- Minimal CSP and its security trade-off: [DEC-31](../core/decision-log.md#dec-31-platform-hardening-defaults). No strict script/style nonce requirement; viewer-only origin checks remain.
- Header coverage amendment, 2026-09-21: the framework emits a 308 normalization redirect for a repeated slash or a backslash before any header mechanism runs, and no option disables it. Those responses are a narrow, asserted exception to universal header coverage at the application server. Nothing else is excluded. Public HTTPS header verification stays in deployment acceptance through the TLS reverse proxy the deployment already requires. R-47, R-48 and R-50 carry the canonical wording.
- Local caching only, remote caching deferred: [the roadmap](../core/roadmap.md). Future remote activation requires provider/confidentiality approval and repeated isolation proof.
- Dedicated-session migration locking and process-local context ownership remain required by the [roadmap](../core/roadmap.md). This record does not replace them.

Acceptance of this architectural decision does not by itself authorize implementation.

---
status: accepted
date: 2026-09-19
---

# Foundation integration stays native-first and generated outputs stay uncommitted

The platform foundation uses framework-native startup and header integration first, one development-only Storybook host, and a build-generated module registry. These choices avoid introducing custom infrastructure before the production integration has been tested. Acceptance of the approach is not proof that a particular framework hook satisfies it.

## Runtime integration

An explicit runtime bootstrap validates the selected entrypoint's configuration, constructs its application-owned context once and completes migrations before accepting traffic. Imports and builds must not initialize runtime services. Evaluate the framework startup hook first, but a promise of running before request handling is not evidence of migration completion before listening. Prove the actual production lifecycle and context reuse across pages, tRPC and viewer policy generation. Worker and CLI contexts remain separate, process-local owners when Section 1 introduces them.

If the native approach cannot meet those requirements without a custom server, extra pool, internal HTTP workaround or substantial synchronization, stop and obtain a revised decision. Do not silently weaken migrate-before-listen or the single-context requirement. Exact hook and header composition placement remain an early implementation verification gate.

## Generated registry

`apps/genie/src/modules.ts` is generated and gitignored, never committed or hand-edited. Commit module declarations, selection inputs and generator logic instead. Generation is a prerequisite for consumers; clean-checkout CI proves deterministic generation and correct selection, not agreement with a committed generated file. Repeating the same inputs produces identical output. Different customer builds use isolated workspaces/output roots or container contexts so concurrent generation cannot overwrite another selection.

One small build-time selection resolver supplies application registry generation and Storybook discovery. It distinguishes unset from explicitly empty selection, rejects unknown ids and resolves selection before cache lookup. It must not import the runtime registry or initialize deployment services.

## Storybook integration

Use one `apps/storybook` host, official Nx serve/build inference and one explicit Vitest-addon test target where needed. Do not add a second legacy runner or custom orchestration. Prove the pinned combination early with representative UI/placeholder stories and a disposable generated module; later business features populate their own stories. The detailed contract, required Docs/a11y/MCP tooling and story-first TDD remain in [UI development](../architecture/ui-development.md).

## Related accepted decisions

- Minimal CSP and its security trade-off: [DEC-31](../core/decision-log.md#dec-31-platform-hardening-defaults). No strict script/style nonce requirement; viewer-only origin checks remain.
- Local caching only, remote caching deferred: [the roadmap](../core/roadmap.md). Future remote activation requires provider/confidentiality approval and repeated isolation proof.
- Dedicated-session migration locking and process-local context ownership remain required by the [roadmap](../core/roadmap.md). This record does not replace them.

Acceptance of this architectural decision does not by itself authorize implementation.

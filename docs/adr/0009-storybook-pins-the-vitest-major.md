---
status: accepted
date: 2026-09-20
---

# Storybook pins the Vitest major, so the workspace runs Vitest 4

This repository runs one test runner for every layer. Storybook's component-test addon decides which Vitest major that runner can be, so the workspace pins Vitest 4.1.11 instead of the current 5.0.1. The pin costs one major of runner features and buys a released, fully supported Storybook toolchain with official Nx task inference.

## The conflict

Three published constraints cannot hold at once. They were read from the npm registry on 2026-09-20.

| Package | Version | Declaration |
| --- | --- | --- |
| `@storybook/addon-vitest` | 10.6.0 | `vitest: "^3.0.0 \|\| ^4.0.0"` |
| `@storybook/addon-vitest` | 11.0.0-alpha.1 | `vitest: "^3.0.0 \|\| ^4.0.0 \|\| ^5.0.0"` |
| `@nx/storybook` | 23.2.1 and 23.3.0-beta.1 | `storybook: ">=8.0.0 <11.0.0"` |

The workspace also sets `strictPeerDependencies: true` in `pnpm-workspace.yaml`, so an unmet peer fails the install rather than printing a warning. Vitest 5 with Storybook 10 therefore never reaches a test run.

## What was weighed

**Vitest 4.1.11 across the workspace, with Storybook 10.6.0. Chosen.** Every peer resolves with released software: `@vitest/browser-playwright` 4.1.11 exists, Vitest 4 accepts Vite 6, 7 and 8, and `@nx/storybook` 23.2.1 accepts Storybook 10. One runner serves the unit, integration and component layers. The cost is one major of Vitest features that no code in this repository uses yet, and a line in the tech stack that no longer names the newest release.

**Vitest 5 everywhere except the Storybook host. Rejected.** Two Vitest majors would sit in one lockfile, the shared Vitest preset would split in two, and the component collection would run a different major from the unit collection. The extra surface buys nothing that the chosen option lacks.

**Storybook 11.0.0-alpha.1 with Vitest 5. Rejected.** It puts an alpha dependency under the whole platform, and `@nx/storybook` refuses Storybook 11, so Spec 0 R-2 and R-41c would need hand-written Nx executors in place of official inference. Two acceptance rules bend at once.

**Wait for a stable Storybook 11. Rejected.** Gate G1 blocks S0-04, and S0-04 blocks every later Section 0 ticket. Upstream has committed to no date.

## What this decision does not change

The four test layers stay as Spec 0 defines them. Integration tests still run against a real Postgres through Testcontainers, and end-to-end tests still run on Playwright against a deployed application. The Vitest browser provider runs isolated components and never replaces the end-to-end layer.

## What reopens it

Raise the Vitest major when both conditions hold.

1. Storybook 11 reaches a stable release whose `@storybook/addon-vitest` accepts the target Vitest major.
2. `@nx/storybook` publishes a release whose `storybook` peer range accepts that major, replacing the current `<11.0.0` cap.

When both hold, raise `vitest` and every `@storybook/*` pin in one change, rerun the G1 evidence in `docs/tickets/spec-0/02-storybook-compatibility-g1/evidence.md`, and amend the unit-test and integration-test rows of `../core/tech-stack.md`. Do not raise Vitest alone, because the addon peer is what caps it.

## Related records

- One development-only Storybook host and its early pinned-version gate: [ADR 0008](0008-foundation-integration-and-generated-registry.md).
- The story-first workflow and the four test layers: [UI development](../architecture/ui-development.md).
- The requirement this pin serves: [Spec 0](../specs/00-monorepo-foundation.md) R-41a to R-41e and AC-27.

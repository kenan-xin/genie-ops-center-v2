# Storybook and UI development

Status: accepted planning scope, 2026-09-18; implementation and pinned-version compatibility are not yet proven. Section 0 owns the harness; each later section owns its UI stories. This is an additional component-testing layer, not a replacement for unit, database integration, or deployment E2E tests.

## Ownership and discovery

`apps/storybook` is a development-only composition project tagged `app`, using `@storybook/nextjs-vite`. One launch displays `UI`, `Core`, and `Modules/<capability>` groups. Stories live beside the components they exercise in `packages/ui`, browser-safe core feature folders, and `packages/modules/<capability>`. Tenant-specific capability modules follow the same module convention, not a customer folder or a hard-coded catalogue. Custom application composition stories may remain in their owning application and are included only when explicitly selected.

The host composes browser-safe entrypoints; it does not import the runtime module registry, server barrels, database factories, tenant bootstrap, or deployment environment validation. Stories and fixtures obey their owning package's import rules. Cross-module compositions belong in an app, never in core or another module. Shared build presets stay in `packages/config` without internal project imports; UI owns tokens, and the host wires UI themes and feature providers. Production code never imports stories or the Storybook host.

Development defaults to all available capability modules. Scoped builds/tests use the same resolved `MODULE_INCLUDE` semantics as the application: unset means the development default, explicitly empty means UI/core only, unknown ids fail. Resolve selection before story discovery and Nx cache lookup; never glob every module and merely hide excluded entries in the sidebar. Selected modules' assets, docs, fixtures, dynamic imports, and source maps are part of this boundary. Customer custom-app stories require explicit composition selection, included in cache inputs, and are not gathered by a blanket customer-folder glob.

Adding a generated module with UI makes its stories discoverable without editing the host's module list or CI. Nx must track the actual story owners and their dependencies even where discovery uses globs or a generated manifest. Changes to stories, source, fixtures, tokens, messages, providers, shared configuration, lockfile, or selection invalidate the relevant outputs. Local caches must respect selection; remote caching is disabled and deferred beyond Section 0. Any future approved remote cache must pass the same selection/isolation checks before activation. Access to cached/static artifacts follows source confidentiality. Storybook output is a developer artifact, never part of a customer runtime image or a public publish by default.

## Developer experience

- Install compatible versions of Storybook, `@storybook/nextjs-vite`, `@storybook/addon-vitest`, `@storybook/addon-docs`, and `@storybook/addon-a11y`. Keep Storybook packages aligned and `@nx/storybook` aligned with Nx. Verify peer dependencies against the repository's pinned Next.js, React, Vite, Vitest, TypeScript, and Node versions rather than silently changing their majors.
- Use Docs/Autodocs for purpose, public props, usage, states, keyboard behavior, and links to the relevant design/specification. Use MDX for explanations that need it, not as duplicate specifications.
- Include `@storybook/addon-mcp` in the foundation developer tooling. Requested installation command: `npx storybook add @storybook/addon-mcp`. During implementation, verify current official setup instructions and compatibility with the pinned Storybook toolchain, review generated configuration/lockfile changes, and document the local agent connection and a successful smoke check. Keep it development-only, respecting module-selection confidentiality and excluding it from customer runtime images; do not expose the developer endpoint publicly by default. This is a planned installation, not a claim that the addon is installed or verified.
- Enable built-in controls, action inspection, viewport, backgrounds, and toolbar globals. Theme/branding and locale decorators reuse product tokens and message catalogues. Show light/dark and phone/desktop states. Do not install legacy addon bundles for features already built in.
- Run and debug interaction tests in Storybook and through the CLI. Configure the accessibility addon to fail the component CI gate on violations, with any necessary exception explicitly scoped and justified. Automated checks supplement manual accessibility review.
- Use deterministic, synthetic browser fixtures. Reset query caches, stores, handlers, timers, and story globals between tests. Where network-backed UI needs simulation, use boundary-level fixtures/handlers (MSW 2+ if introduced), never real tenant endpoints, credentials, identity providers, or customer data. No unhandled real network requests in component tests. Fonts/assets must work reproducibly without live third-party fetches.
- Paid visual-regression hosting, cloud publishing, and additional optional addons need a separate decision; this baseline requires none of them. Storybook accessibility or interaction success is not screenshot approval.

Async server components remain an integration boundary: expose and exercise the browser-facing UI with explicit input fixtures, and prove server behavior in integration/E2E tests. Experimental Storybook RSC support is not a foundation acceptance dependency. Do not restructure server authorization into browser code to make a story run.

## Story-first TDD

Before creating or changing UI, read the relevant approved specification, canonical design, and this workflow. Agree the public behavior/seam being tested; use accessible roles, labels, visible output, and public callbacks rather than private state or internal call counts.

For each behavior, work in a vertical slice:

1. Describe the scenario and expected outcome in a colocated typed story, including the relevant documentation and deterministic input state.
2. Write its interaction assertion in the story's `play` function, or a focused unit test when the seam is pure logic. Run it and observe a meaningful failure before implementing the behavior; a broken import or missing test configuration alone is not sufficient red evidence.
3. Implement only enough component behavior to pass, rerun, then repeat for the next behavior. A minimal renderable scaffold is allowed to establish the failing assertion. Do not write an entire speculative test suite before the first implementation slice.
4. Before consuming the component in the application, finish the applicable documented states and passing tests. Static components need render/accessibility coverage; do not invent meaningless click tests. Pure logic gets unit coverage where appropriate without repeating the same assertion at every layer.
5. Wire into the actual app and retain the section's real integration and E2E proof. Document what mocks prevent the story from proving.

Required states are behavior-dependent: default, loading, empty, error, disabled, validation, permission-denied, and successful interaction, plus relevant phone/desktop and theme variants. Permission and entitlement fixture stories prove presentation only. They never grant the Section 0 runtime stub new permissions or substitute for real role, scope, database isolation, CSP, routing, or startup verification.

## Test and task boundaries

| Layer | Runner and boundary | What it proves |
| --- | --- | --- |
| Unit | Vitest, pure public logic | Transformations, validation, state transitions |
| Component | Storybook Vitest addon, Vitest browser mode with Playwright Chromium provider | Real browser rendering, `play` interactions, accessibility, isolated UI states |
| Integration | Vitest + Testcontainers, real migrations/Postgres | Services, procedures, authorization and persistence |
| E2E | Playwright against the deployed application | Real navigation, identity, headers, wiring and complete user paths at phone and desktop sizes |

The browser provider is not the E2E runner: component tests require neither a running Storybook server nor a live application/database. Keep separate Vitest projects, test inclusion, reports, and coverage boundaries so stories are not also collected as unit tests. The Vitest addon is the story runner; do not add the legacy Storybook test-runner as a duplicate execution path.

Expose Nx targets `storybook` (interactive), `build-storybook` (static output), and `test-storybook` (non-watch component CI run). Use `@nx/storybook` configuration inference for serve/build where supported; explicitly wire the Vitest-addon test target if the inferred target does not do so. Avoid duplicate script/plugin target ownership. Keep plain package scripts and record actual target resolution. Serve/watch targets are not cacheable; deterministic build/test outputs are declared and cacheable with all dependency and selection inputs.

Pull requests run affected Storybook build and component tests alongside existing gates. Changes to shared foundations must affect their story consumers. CI failures include failed interaction/accessibility assertions, broken documentation/build, and missing required UI stories. Existing full E2E merge gates stay unchanged. Verify collection and failure propagation so a successful zero-test command cannot satisfy the gate.

## Foundation and later sections

Section 0 delivers the working host, presets, representative UI and placeholder stories with interaction tests, module generator wiring, isolation/selection proof, CI targets, and agent instructions. A core grouping/fixture seam is established without inventing later identity or shell features. Core business stories arrive with their features in Sections 1–3; the complete primitive catalogue remains Section 3; Solutions stories arrive in Section 4. Deferred business modules remain deferred, but their generator path is proven with a disposable module fixture.

The module generator adds a documented story and applicable interaction test when it generates UI, plus browser-safe local fixtures. Headless modules do not receive dummy stories. Existing stage-appropriate unit/integration/E2E requirements remain. Generated UI fixtures must be clearly distinguished from authorized runtime access under the Section 0 stub.

## Source verification

Documentation checked 2026-09-18; these are documentation findings, not installed-toolchain proof:

- [Next.js with Vite](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite): recommended framework, Next.js >=14.1, Vite >=5, routing adapters, experimental RSC support.
- [Nx Storybook](https://nx.dev/docs/technologies/test-tools/storybook/introduction): plugin inference, Nx/plugin version alignment, Storybook >=8 and <11 support. The generic generator's listed framework choices do not explicitly include nextjs-vite; verify generated output and configure the requested framework explicitly when necessary.
- [Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon): Vite framework, Vitest >=3, browser-mode provider, rendering/interaction tests and CLI execution without serving Storybook. Its version floor does not by itself prove compatibility with the repository's Vitest 5 pin.

Before accepting implementation, install the pinned combination and demonstrate dev startup, static build, CLI and in-UI tests, a deliberate failing interaction, and an accessibility failure. Any incompatible pinned major is a reported blocker, not permission to silently downgrade the stack.

# S0-10 design — Storybook selection, confidentiality and cache

Bead: `genie-ops-center-v2-1rd.10`. Owned child: `genie-ops-center-v2-2cg`.
Status and claims live in Beads; this file records the approach, not acceptance.

## 1. The selection input

`build-storybook` and `test-storybook` hashed the raw `MODULE_INCLUDE` value in
`nx.json`. That value cannot tell an unset variable from an explicitly empty
one, although `resolveModuleSelection` calls those opposite selections, so one
selection could be restored from the other's cache entry. This is the defect
`2cg` owns.

The fix consumes the contract S0-06 published and the application already uses:
the `runtime` input `node tools/generators/src/selection/print.ts`. It prints the
canonical serialized selection (`{"source":"unset"|"explicit","ids":[...]}`) and
a digest over the selected entries' id, package name and entrypoint path. The
raw env input is removed from both targets; the development and watch targets
stay uncached.

## 2. Recording the story owners

Discovery is data-driven: `.storybook/main.ts` reads package metadata and builds
story globs from the resolved roots, so a module is not a declared dependency of
`@genie/storybook`. Nx therefore cannot see a module's story as an input through
the dependency graph.

A `storybookOwners` named input in `nx.json` names the trees that actually hold
the stories and the surfaces they compose:

- `packages/ui/src/**/*` — UI primitives, tokens, fixtures, stories
- `packages/core/src/**/*` — the core story seam and the message catalogue
- `packages/modules/*/src/**/*` — every module's stories, components and fixtures
- `packages/modules/*/package.json` and `packages/modules/*/tsconfig.json` —
  the package metadata and config discovery reads, which no dependency edge
  covers
- `packages/config/src/**/*` — shared configuration and the Tailwind preset

The globs are a superset of any one selection, which is safe: over-invalidation
only costs a cache hit, while under-invalidation serves the wrong output.

## 3. The token and provider seam

R-41b names a shared token and a provider as inputs. Neither existed, and the
design contract says `packages/ui` owns tokens while the host wires the theme.
A minimal fixed-layer token pair and a browser-safe `ThemeProvider` were added
under `packages/ui/src/theme`, and the preview decorator now renders every story
through it. This is a Section 0 fixture seam, not the Section 3 catalogue: it
defines two surfaces, no tenant-derived colour and no colour-space computation.

## 4. The matrix

`apps/storybook/testing/selection-confidentiality.integration.test.ts` stages the
workspace (a copy with the root `node_modules` reinstalled, because the Vitest
browser server cannot serve an addon setup file through a symlinked root) and
drives real `build-storybook` and `test-storybook` runs. A second module fixture
is written into the stage so two explicit selections produce genuinely different
output; the real S0-08 generator is exercised in the same stage at the end.

Confidentiality is read from the artifact, never from the sidebar: every file
under `storybook-static` is scanned for needles unique to the placeholder module
(its story title, its fixture text, its package name) that were first confirmed
present in an included build. The development server is also driven over the
real MCP protocol: the addon's `docs-list` tool is called and its response is
checked for the same needles, so the tool response itself is proved, not only
the index it reads.

Cache identity is read from restored bytes: `index.json` and the run's cache
line, with every `NX_` variable dropped and a stage-local cache and state
directory, so the measurement is of the build graph rather than of the caller.

## 5. The image

`deploy/Dockerfile` copies only the app, packages, tools and root manifests, and
`.dockerignore` excludes `apps/storybook`, `**/storybook-static` and
`**/*.stories.tsx`. A fast config assertion holds that; S0-11 owns the real image
matrix.

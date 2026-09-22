# apps/storybook

The Storybook host: the development workbench where UI, core, and module stories render. It is one workspace package that composes the shared preset from `@genie/config/storybook` and resolves the module selection through `@genie/generators`, so the sidebar holds exactly the selected modules' stories.

The host is development-only. No Storybook package, story, fixture, or static output enters a customer runtime image.

## What belongs here

Only the host configuration: `.storybook/main.ts` and `.storybook/preview.tsx`. The main file reads the module selection, spreads the shared preset, and nothing else. The preview file sets the accessibility gate, the docs table of contents, and the theme toolbar.

## What must not go here

No server barrel, no database factory, no tenant bootstrap, and no deployment environment read. No story file: stories live in `packages/ui`, `packages/core`, and each module package. No component that exists only for this host rather than for the product.

## What it imports

The shared preset from `@genie/config/storybook` and the module selection resolver from `@genie/generators`, both at configuration time, plus `packages/core` and `packages/ui` at render time through the story files it discovers. For import direction the host counts as an app: it imports config, generators, core, ui, and the modules, and nothing internal imports it.

## Selection and caching

The host resolves `MODULE_INCLUDE` in `.storybook/main.ts` before story
collection, so an excluded module is never globbed. Unset means every available
module, an explicit empty string means UI and Core only, and an unknown id
fails.

Both cacheable targets declare the same pre-hash selection input the
application uses, `node tools/generators/src/selection/print.ts`, in `nx.json`.
The raw `MODULE_INCLUDE` value cannot tell an unset variable from an empty one,
so hashing it would let one selection restore the other's build. A
`storybookOwners` named input covers the story owners and shared surfaces
(`packages/ui`, `packages/core`, `packages/modules/*`, `packages/config`), so a
story, component, token, provider or fixture change invalidates the host. The
development and watch targets are never cached.

## Testing

- `testing/targets.test.ts` is a fast configuration assertion over the resolved
  Nx graph and the image exclusions. It runs in the `unit` Vitest project
  (`pnpm test` / `nx test @genie/storybook`).
- `testing/selection-confidentiality.integration.test.ts` stages the workspace
  and drives real `build-storybook` and `test-storybook` runs across all
  selections, inspects the static output for excluded content, exercises the
  local cache, and proves interaction and accessibility failures propagate. It
  runs in the `storybook-integration` Vitest project
  (`nx test:integration @genie/storybook`).
- The `storybook` project runs the component tests from the stories themselves
  (`test-storybook`). The two collections are separate and must not be merged.

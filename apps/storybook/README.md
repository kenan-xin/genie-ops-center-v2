# apps/storybook

The Storybook host: the development workbench where UI, core, and module stories render. It is one workspace package that composes the shared preset from `@genie/config/storybook` and resolves the module selection through `@genie/generators`, so the sidebar holds exactly the selected modules' stories.

The host is development-only. No Storybook package, story, fixture, or static output enters a customer runtime image.

## What belongs here

Only the host configuration: `.storybook/main.ts` and `.storybook/preview.tsx`. The main file reads the module selection, spreads the shared preset, and nothing else. The preview file sets the accessibility gate, the docs table of contents, and the theme toolbar.

## What must not go here

No server barrel, no database factory, no tenant bootstrap, and no deployment environment read. No story file: stories live in `packages/ui`, `packages/core`, and each module package. No component that exists only for this host rather than for the product.

## What it imports

The shared preset from `@genie/config/storybook` and the module selection resolver from `@genie/generators`, both at configuration time, plus `packages/core` and `packages/ui` at render time through the story files it discovers. For import direction the host counts as an app: it imports config, generators, core, ui, and the modules, and nothing internal imports it.

# src/storybook

The shared Storybook configuration preset. The host in `apps/storybook/.storybook/main.ts` spreads it, so the framework, the story globs, and the addon list are decided once and consumed by every host.

## What belongs here

The preset function `sharedStorybookConfig` and its types. It takes the module roots that the S0-01 selection resolver already resolved and returns the framework, the story globs, and the addon list. It stays build-safe: importing it starts no service, reads no environment value, and imports no Storybook package, so `@genie/config` carries no Storybook dependency.

## What must not go here

No Storybook import, no environment read, no framework besides `@storybook/nextjs-vite`, and no host-specific path. The Vitest addon, its configuration, and its entry in the addon list belong to the task that wires component testing. Any value only one host needs lives in that host's `.storybook` folder, not here.

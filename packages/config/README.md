# packages/config

The shared development configuration for every package in this repository.

## What belongs here

The shared TypeScript settings, the Oxlint configuration and its vendored rules, the oxfmt settings, the Tailwind preset, the unit-test preset, and the reserved Storybook configuration extension point. Each preset exists once. Another package extends a preset and never restates a rule.

## What must not go here

Product code, business logic, React components, design tokens, and database access. Design tokens belong to `packages/ui`.

## What it imports

No internal project. This package imports its tool packages only. A package configuration file consumes these presets. Product runtime source must not import this package.

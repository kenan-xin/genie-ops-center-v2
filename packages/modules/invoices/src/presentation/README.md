# src/presentation

What the module renders: the Invoices list and the invoice record, the status badge, the
allocation and history tables both record pages share, the page components core feeds, and the
view types they take.

## What belongs here

Components, their stories, and their fixtures. A component takes its data as props, so it renders
in a story with no database, no network call, and no tenant. `views.ts` holds the shapes the
loaders answer and the pages render, and `module-pages.tsx` maps each loader's data to its
component. The stories are the specification: they document the component on its Docs page and
they are the browser behavior tests that `nx run @genie/storybook:test-storybook` runs.

## What must not go here

Data fetching of its own, a query client, a permission check, any import of the runtime registry
or the deployment environment, and any money arithmetic: a page only formats the cents the
dataset answered.

## What it imports

`@genie/ui`, `react`, `PageLink` from `@genie/core/features/shell`, `../contract.ts`, and its own
files, plus `import type` from `@genie/core`. The story file also imports `@storybook/nextjs-vite`
and `storybook/test`.

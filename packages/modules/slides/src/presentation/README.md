# src/presentation

What the module renders.

## What belongs here

Components, their stories, fixtures, and the browser hooks that read the Slides list and one deck
through `useModuleClient`. A page component takes the loader's answer as `view` and starts its
query from it, so a story renders the page with a stub client and no database, no network call,
and no tenant. The stories are the specification: they document the component on its Docs page and
they are the browser behavior tests the Storybook host runs.

## What must not go here

A permission check, the router, the schema, the deployment environment, or any import of
`src/services/export/`. A component never asks a permission: its page's `permission` and its
loader do. Nothing here imports another module or `pptxgenjs`.

## What it imports

`@genie/ui`, `react`, `@tanstack/react-query`, `@genie/core/rpc/client`, `PageHeader` from
`@genie/core/features/shell`, the module's browser-safe `contract.ts`, and its own fixtures. The
story file also imports the Storybook types.

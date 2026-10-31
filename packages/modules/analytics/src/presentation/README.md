# src/presentation

What the module renders: the Dashboards list, one dashboard with its filters and panels, and the
view types the loaders answer.

## What belongs here

Components, their stories, their fixtures, the browser-safe view types, and browser hooks. A story
supplies a stub module client and fixtures, so it renders with no database, no network call and no
tenant. The stories are the specification: they document each screen on its Docs page and they are
the browser behavior tests the Storybook host runs.

## Rules

- A component and a hook call the module's own procedures through `useModuleClient`. They call no
  other module.
- Only the hook module narrows a `z.unknown()` answer. A component receives the narrowed types.
- A component gets its data from props or from those calls. It builds no query client of its own.
- A component asks no permission. The page loader and the procedure already asked.

## What must not go here

An import of the runtime registry or the deployment environment. A permission check. A query client
owned by the folder.

## What it imports

Components import `@genie/ui`, `react` and `@tanstack/react-query`. They import shell parts from
`@genie/core/features/shell`. They import the module's contract and their own fixtures. Type-only
imports come from `@genie/core`. Browser hooks import the client and its error schema from
`@genie/core/rpc` and `@genie/core/rpc/client`. Story files also import the Storybook types and
`storybook/test`.

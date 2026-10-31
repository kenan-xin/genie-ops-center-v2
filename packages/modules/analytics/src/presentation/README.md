# src/presentation

What the module renders.

## What belongs here

Components, their stories, their fixtures, and the view types the server answers and the
browser reads. A component takes its data as props, so it
renders in a story with no database, no network call, and no tenant. The stories are the
specification: they document the component on its Docs page and they are the browser behavior
tests the Storybook host runs.

## What must not go here

Data fetching, a query client, a permission check, and any import of the runtime registry or
the deployment environment. A component that cannot render from props alone does not belong in
this folder.

## What it imports

`@genie/ui`, `react`, `PageHeader` from `@genie/core/features/shell`, its own fixtures, the
module's contract, and type-only imports from `@genie/core`. The
story file also imports the Storybook types.

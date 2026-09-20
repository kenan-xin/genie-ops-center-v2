# src/presentation

What the module renders. In Section 0 this is the whole module.

## What belongs here

Components, their stories, and their fixtures. A component takes its data as
props, so it renders in a story with no database, no network call, and no tenant.
The stories are the specification: they document the component on its Docs page
and they are the browser behavior tests that `nx run @genie/storybook:test-storybook`
runs.

## What must not go here

Data fetching, a query client, a permission check, and any import of the runtime
registry or the deployment environment. A component that cannot render from props
alone does not belong in this folder.

## What it imports

`@genie/ui`, `react`, and its own fixtures.

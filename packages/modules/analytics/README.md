# packages/modules/analytics

The Analytics capability module.

## What belongs here

The module declaration and everything it names: the `dashboard` schema with its own migration
history, the dashboard config schema, the contract and the router behind `can()`, the permission
keys and default roles, the navigation, the frame-origin provider, the page components with their
stories, and the factories for its own tables under `testing/`.

Three entry points, so a browser never loads the server graph. `@genie/module-analytics` is the
module-facing declaration the application mounts. `@genie/module-analytics/contract` is the API the
browser client types its calls from. `@genie/module-analytics/presentation` is the client surface a
story and the shell render.

## What must not go here

A runtime registry import, a database client, a deployment environment read, an import of
another module, and any customer-specific content. Nothing here may be imported by core or by
another module.

## What it imports

`@genie/core`, `@genie/ui`, `react`, `zod` and `drizzle-orm`, never `@orpc/*`. A module sits
above core and the user-interface package and below the app, so nothing here imports an app, a
customer folder, or a sibling module.

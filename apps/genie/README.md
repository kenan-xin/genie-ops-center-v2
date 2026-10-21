# apps/genie

The standard application composition for a deployment.

## What belongs here

The composition of core, the user-interface package, and the included modules: routing, the shell, the layout, and the mounting of module entrypoints. An app composes and contains no business logic.

## What must not go here

Business logic, a module implementation, a schema, a database access, and anything a custom app under `customers/<slug>/app/` would have to copy to reuse. Logic belongs to core or a module, never to the app.

## What it imports

Every layer: `packages/core`, `packages/ui`, and the included modules. The app is the top of the import direction and nothing internal imports it.

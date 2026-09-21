# packages/modules/placeholder

The placeholder capability module. It exists so Section 0 can prove that a module
reaches the sidebar, the component-test run, and the selection boundary before any
real capability is built.

## What belongs here

The module declaration and everything it names: the `placeholder_record` schema with its own
migration history, the read router behind `can()`, the permission keys, the navigation, the
configuration schema, the frame origin, the page components with their fixtures and stories,
and the factories for its own tables under `testing/`.

Two entry points, so a browser never loads the server graph. `@genie/module-placeholder` is the
module-facing declaration the application mounts. `@genie/module-placeholder/presentation` is
the client surface a story and the shell render.

Historical note, kept because the sentence below still describes the rest of the rules: in
Section 0 this package held presentation only, and S0-04 added the schema, the router, the
permission keys, and the server module
declaration this package's `genie.module.entrypoint` already points at.

## What must not go here

A runtime registry import, a database client, a deployment environment read, an
import of another module, and any customer-specific content. Nothing here may be
imported by core or by another module.

## What it imports

`@genie/ui` and `react` only. A module sits above core and the user-interface
package and below the app, so nothing in this package imports an app, a customer
folder, or a sibling module.

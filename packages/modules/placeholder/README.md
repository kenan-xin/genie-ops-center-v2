# packages/modules/placeholder

The placeholder capability module. It exists so Section 0 can prove that a module
reaches the sidebar, the component-test run, and the selection boundary before any
real capability is built.

## What belongs here

In Section 0, presentation only: a page component, its fixtures, and its stories.
S0-04 adds the schema, the router, the permission keys, and the server module
declaration this package's `genie.module.entrypoint` already points at.

## What must not go here

A runtime registry import, a database client, a deployment environment read, an
import of another module, and any customer-specific content. Nothing here may be
imported by core or by another module.

## What it imports

`@genie/ui` and `react` only. A module sits above core and the user-interface
package and below the app, so nothing in this package imports an app, a customer
folder, or a sibling module.

# packages/modules/invoices

The Invoices and Payments capability module.

## What belongs here

The module declaration and everything it names: the module's tables (customers, documents,
invoices, payments, allocations, allocation events and field origins) with their own migration
history, the contract and the router behind `can()`, the permission keys, the record types, the
datasets, and the factories for its own tables under `testing/`.

Three entry points, so a browser never loads the server graph. `@genie/module-invoices` is the
module-facing declaration the application mounts. `@genie/module-invoices/contract` is the API the
browser client types its calls from. `@genie/module-invoices/presentation` is the browser-safe
client surface that the pages and their stories use. Tests import the factories from
`@genie/module-invoices/testing`.

## What must not go here

A runtime registry import, a database client, a deployment environment read, an import of
another module, and any customer-specific content. Nothing here may be imported by core or by
another module.

## What it imports

`@genie/core`, `zod` and `drizzle-orm`, never `@orpc/*`. A module sits above core and below the
app, so nothing here imports an app, a
customer folder, or a sibling module.

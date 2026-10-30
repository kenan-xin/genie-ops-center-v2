# src/services/pages

The server loaders behind the module's pages (Spec 7 R-1, R-9).

## What belongs here

One file per concern: `lists.ts` loads the Invoices list through `queryDataset`, `records.ts`
loads a record page behind its one `invoices:read` check, `history.ts` reads the link history from
the module's own append-only events, and `status.ts` names the four invoice states from a dataset
row. A balance or an allocation is read only through the module's `invoices.invoices` and its
siblings, as of the reporting date, and never with SQL of its own.

## What must not go here

A React component, a formatting helper, a second balance formula, and any balance read outside
`queryDataset`. A second formula would make the page disagree with the agent (P3).

## What it imports

`@genie/core`, `drizzle-orm`, `zod`, its own files, the module's schema and contract, and the view
types from `../../presentation/views.ts`.

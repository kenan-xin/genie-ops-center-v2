# src/services/pages

The server loaders behind the module's pages (Spec 7 R-1, R-9).

## What belongs here

One file per concern: `lists.ts` loads the Invoices list through `queryDataset`, and `status.ts`
names the four invoice states from a dataset row. A loader reads only through the module's
`invoices.invoices` and its siblings, as of the reporting date, and never with SQL of its own.

## What must not go here

A React component, a formatting helper, a second balance formula, and any read outside
`queryDataset`. A second formula would make the page disagree with the agent (P3).

## What it imports

`@genie/core`, `zod`, its own files, and the view types from `../../presentation/views.ts`.

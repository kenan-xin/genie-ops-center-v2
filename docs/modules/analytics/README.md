# Module: Analytics

## Who it is for

Anyone who wants live charts over the data that modules publish.

## What it does

A person builds dashboards of panels by chat beside the dashboard, or by hand. A panel reads only published datasets through core (`DEC-54`), passes the core chart gate before it is saved, shows its dataset and read time, and refreshes every 10 seconds. Dashboards are owner-only. The module knows no other module: the demo seed writes the Receivables overview starter dashboard. Full requirements: `../../specs/07-invoice-and-payments.md`, R-48 to R-51.

## Permissions and roles

`analytics:read` and `analytics:write`, with default roles named in the module's declaration.

## Tables

`dashboard`: owner, name, and a zod-checked config of filters and panels.

## Not built

Shared dashboards, free SQL, a dashboard slot on a core page.

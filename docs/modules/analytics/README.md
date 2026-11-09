# Module: Analytics

## Who it is for

Anyone who wants live charts over the data that modules publish.

## What it does

A person builds dashboards of panels by chat beside the dashboard, or by hand. A panel reads only published datasets through core (`DEC-54`), passes the core chart gate before it is saved, shows its dataset and read time, and refreshes every 10 seconds. Dashboards are owner-only. The module knows no other module: the demo seed writes the Receivables overview starter dashboard. Full requirements: `../../specs/07-invoice-and-payments.md`, R-48 to R-51.

## Permissions and roles

| Key | Grants |
| --- | --- |
| `analytics:use` | Use the Analytics workspace (the Dashboards entry, `DEC-50`). |
| `analytics:read` | Open your own dashboards. |
| `analytics:write` | Build and change your own dashboards. |

Default roles: `Analytics user` (`analytics:use`), `Analytics viewer` (`analytics:use`, `analytics:read`) and `Analytics editor` (all three keys). No name that another module declares, because seeding keeps one role per name. Each key is tenant-wide and checked through `can()` with no resource: a dashboard is not a record type, so no role scope points at one, and every read filters on the owner. Access adds the module with `Analytics editor`, its `defaultAccessRole`, because a person reaches only the dashboards that person owns (owner, A6, 2026-11-02).

## Tables

`dashboard`, one row per dashboard of one owner:

| Column | Meaning |
| --- | --- |
| `id` | uuid primary key. |
| `owner_user_id` | The owner's `user.id`, by value with no foreign key (data-shape module rule 2). |
| `name` | 1 to 80 characters after trim, unique per owner whatever its case and outer spaces; another owner may use the same name. |
| `config` | The zod-checked config: dashboard filters (a date range preset or a custom range, and one field filter) and the panels in display order. |
| `undo` | The last 20 saves, newest first, each `{ name, config }`. |
| `version` | Starts at 1 and moves up at each save. |
| `created_at`, `updated_at` | With time zone. |

Limits: 12 panels per dashboard, each panel 1 to 4 columns wide and 1 to 2 rows high, with an id `p<n>` (a new panel takes the highest current number plus one, so removing the last panel frees its number for the next one); 20 undo entries; 20 steps per change.

## Agent tools and rules

The module provides the `agent-tools` capability and the `agent-surface` capability. Each tool runs as the person who asks, checks its key through `can()` again, and reads or changes only that person's own dashboards; another person's dashboard id answers `not-found`. Core writes one audit row per call.

| Tool | Offered to | Does |
| --- | --- | --- |
| `analytics-list-dashboards` | `analytics:read`, in Ask and in a Dashboards chat | Lists the person's dashboards: id, name, version and each panel's id, chart type and title. |
| `analytics-read-dashboard` | `analytics:read`, in Ask and in a Dashboards chat | Reads one dashboard: name, version, filters and each panel's id, layout and chart config. |
| `analytics-create-dashboard` | `analytics:write`, in a Dashboards chat only | Creates an empty dashboard with a name unique among the person's dashboards. |
| `analytics-change-dashboard` | `analytics:write`, in a Dashboards chat only | Saves one change of add-panel, change-panel, remove-panel, move-panel, rename or set-filters steps. |

The two write tools are marked `writes: true`. A change goes through the same store path as a hand save: every added or changed panel passes the chart gate, except a panel whose only change is its title, because a rename reads no data (plan D2), a refused step saves nothing, and the save adds an Undo entry that Undo on the dashboard restores (Spec 7 R-46, R-49). A create has no earlier version to restore, so it adds no Undo entry: Delete on the Dashboards list is the inverse of a chat create, and it removes the new dashboard for good (R-46). No tool output holds a clock value or data rows, because a recorded follow-up request holds the output.

Ask and every Dashboards chat get the two read tools and one read rule for a holder of `analytics:read`: the tools read only the person's own dashboards.

The module declares the agent surface "Dashboards agent" in `src/agent-surface.ts`, on the dashboard page `/m/analytics/dashboards/:id`, and it accepts a handoff from Ask (`DEC-29`, amended 2026-11-07; S7-42). Only a Dashboards chat of a holder of `analytics:write` gets the two write tools and the surface's rules, and Ask offers a holder of `analytics:write` the handoff to it. The rules say that the chat's dashboard is its record, that a change runs only when the person's own message or a brief from Ask asks for it and has Undo (R-46), that a dashboard is built panel by panel with one `add-panel` step per `analytics-change-dashboard` call, that a second dashboard is made only when the person asks for one, that Try again reads the dashboard first, and that a chart or a table with no place named first asks whether to add it as a panel or just show it here. They also say that a panel takes the config of a Chart in an answer and passes the chart check, and that the dashboard filters apply to every panel and are not repeated in a panel query. The change answer holds the new `version`, and the tool takes no expected version, so a panel-by-panel build needs no read between panels.

The surface's `createRecord` checks `analytics:write` and inserts the empty dashboard, named by the brief's title, with its created audit row through the handoff's transaction, with the same insert as New dashboard. A name that the person already uses answers `dashboard-name-taken`, and the handoff saves nothing. It adds no Undo entry: Delete on the Dashboards list is its inverse.

The dashboard page shows the chat beside the dashboard for a person who may ask while AI is on: from the `lg` width it is a 22rem column to the right of the panels, and below that it follows them. Every message names the dashboard as the open record, and after each answer the page reads the dashboard again. While AI is off, a note says that the dashboard can still be changed by hand.

## Demo seed

The app's demo seed (`apps/genie/testing/seed-demo.ts`, described under "Demo seed" in the invoices-and-payments README) writes the Receivables overview starter dashboard for the demo account when its module list holds both `analytics` and `invoices` (R-51). The module knows no other module, so the config lives in the app, in `apps/genie/testing/receivables-overview.ts`. This module's `testing` entry provides only the generic `planDashboardSeed` and `seedDashboard`. The seed parses the config and writes the row directly with no chart gate, because it runs in plain Node, and adds one `analytics:dashboard-created` audit row with no actor. A second run finds the owner's dashboard of that name and writes nothing. `seed-demo.integration.test.ts` runs every starter panel through the gate as the demo account.

The starter has the Customer field filter on `customerName`, the date range `all`, and six panels: the KPIs Invoiced sales, Collections, Outstanding and Overdue (1 x 1 each), the bar chart Invoiced sales and collections by month (4 x 2, the Chart of the recorded monthly answer), and Overdue ageing in four ranges of days overdue (2 x 2).

## Not built

Shared dashboards, free SQL, a dashboard slot on a core page.

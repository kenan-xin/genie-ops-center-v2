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

Default roles: `Analytics user` (`analytics:use`), `Analytics viewer` (`analytics:use`, `analytics:read`) and `Analytics editor` (all three keys). No name that another module declares, because seeding keeps one role per name. Each key is tenant-wide and checked through `can()` with no resource: a dashboard is not a record type, so no role scope points at one, and every read filters on the owner.

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

Limits: 12 panels per dashboard, each panel 1 to 4 columns wide and 1 to 2 rows high, with an id `p<n>` that is never reused; 20 undo entries; 20 steps per change.

## Not built

Shared dashboards, free SQL, a dashboard slot on a core page.

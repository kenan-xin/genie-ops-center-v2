# Module: Slides

## Who it is for

Anyone who presents figures from the data that modules publish.

## What it does

A person creates a deck by chat, or edits it by hand. A deck is typed elements on 16:9 slides, never HTML. Edits are patch operations guarded by a content hash. A deck freezes its figures when it is made, shows that date, and changes them only on Refresh data. It uses the tenant branding, can be presented full screen, and exports to PowerPoint with native editable charts through pptxgenjs (`DEC-55`). Decks are owner-only. Full requirements: `../../specs/07-invoice-and-payments.md`, R-52 to R-57.

## Permissions and roles

| Key | Grants |
| --- | --- |
| `slides:use` | Use the Slides workspace (the Slides entry, `DEC-50`). |
| `slides:read` | Open your own decks. |
| `slides:write` | Make and change your own decks. |

Default roles: `Slides user` (`slides:use`), `Slides viewer` (`slides:use`, `slides:read`) and `Slides editor` (all three keys). No name that another module declares, because seeding keeps one role per name. Each key is tenant-wide and checked through `can()` with no resource: a deck is not a record type, so no role scope points at one, and every read filters on the owner. Another person's deck answers as missing.

## Tables

`deck`, one row per deck of one owner:

| Column | Meaning |
| --- | --- |
| `id` | uuid primary key. |
| `owner_user_id` | The owner's `user.id`, by value with no foreign key (data-shape module rule 2). |
| `title` | 1 to 80 characters after trim. |
| `content` | The zod-checked content: the slides in display order, each an id `s<n>` that is never reused and its typed elements. A figure, chart or table holds its chart config and the data frozen when it was read. |
| `content_hash` | The hex sha256 of `{ title, content }` as jsonb text, computed by Postgres when the row is written. An edit sends the hash it read and is refused when the stored hash differs. |
| `frozen_on` | The reporting date when the figures were read. Only Refresh data moves it. |
| `undo` | The last 10 saves, newest first, each `{ title, content, frozenOn }`. |
| `image_file_ids` | The files the deck's image elements may name, uploaded for this deck through `FileStorage`. |
| `export_file_id` | The last PowerPoint export, a file saved through `FileStorage`, or null. |
| `created_at`, `updated_at` | With time zone. |

Limits: 20 slides per deck. A slide starts with its one title and holds at most 5 elements: at most one text or bullet list, and at most two figures, charts, tables or images. A deck title of 1 to 80 characters, a slide title of 1 to 90, a text of at most 280, 1 to 5 bullets of at most 80, an image alt text of 1 to 200. A slide table shows at most 12 rows and 5 columns, a slide chart at most 60 points. 10 undo entries, 20 steps per change.

## Not built

Shared decks, Word documents, freely positioned objects, edits by chat.

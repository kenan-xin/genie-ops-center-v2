# Module: Slides

## Who it is for

Anyone who presents figures from the data that modules publish.

## What it does

A person creates a deck by chat, or edits it by hand. A deck is typed elements on 16:9 slides, never HTML. Edits are patch operations guarded by a content hash. A deck freezes its figures when it is made, shows that date, and changes them only on Refresh data. It uses the tenant branding, can be presented full screen, and exports to PowerPoint with native editable charts through pptxgenjs (`DEC-55`). The deck page is owner-only. An image or export link opens for any `slides:read` holder for its 5-minute life, because sharing a deck today means exporting it and sending the file (owner, 2026-11-01, Spec 7 R-52). Full requirements: `../../specs/07-invoice-and-payments.md`, R-52 to R-57.

## Permissions and roles

| Key | Grants |
| --- | --- |
| `slides:use` | Use the Slides workspace (the Slides entry, `DEC-50`). |
| `slides:read` | Open your own decks. |
| `slides:write` | Make and change your own decks. |

Default roles: `Slides user` (`slides:use`), `Slides viewer` (`slides:use`, `slides:read`) and `Slides editor` (all three keys). No name that another module declares, because seeding keeps one role per name. Each key is tenant-wide and checked through `can()` with no resource: a deck is not a record type, so no role scope points at one, and every read filters on the owner. Another person's deck answers as missing. Access adds the module with `Slides editor`, its `defaultAccessRole`, because a person reaches only the decks that person owns (owner, A6, 2026-11-02).

## Tables

`deck`, one row per deck of one owner:

| Column | Meaning |
| --- | --- |
| `id` | uuid primary key. |
| `owner_user_id` | The owner's `user.id`, by value with no foreign key (data-shape module rule 2). |
| `title` | 1 to 80 characters after trim. |
| `content` | The zod-checked content: the slides in display order, each an id `s<n>` (a new slide takes the highest current number plus one, so removing the last slide frees its number for the next one) and its typed elements. A figure, chart or table holds its chart config and the data frozen when it was read. |
| `content_hash` | The hex sha256 of `{ title, content }` as jsonb text, computed by Postgres when the row is written. An edit sends the hash it read and is refused when the stored hash differs. |
| `frozen_on` | The reporting date when the figures were read. Only Refresh data moves it. |
| `undo` | The last 10 saves, newest first, each `{ title, content, frozenOn }`. |
| `image_file_ids` | The files the deck's image elements may name. Only an image upload appends one: a PNG or JPEG stored through `FileStorage` with the owner as uploader. It leaves `content` and `content_hash` alone. The files are removed only with the deck, because Undo can bring an image element back. |
| `export_file_id` | The last PowerPoint export, a file saved through `FileStorage` with the owner as uploader, or null. A new export replaces it and removes the previous file. |
| `created_at`, `updated_at` | With time zone. |

Limits: 20 slides per deck. A slide starts with its one title and holds at most 5 elements: at most one text or bullet list, and at most two figures, charts, tables or images. A slide holds at most one table, beside one text or one other figure, chart or image, not both, because a table takes the wide column. A deck title of 1 to 80 characters, a slide title of 1 to 90, a text of at most 280, 1 to 5 bullets of at most 80, an image alt text of 1 to 200. A slide table shows at most 12 rows and 5 columns, a slide chart at most 60 points. 10 undo entries, 20 steps per change.

## Refresh data

Refresh data reads every figure, chart and table of the deck again through the chart gate, needs `slides:write` and the content hash the person read, and sets `frozen_on` to the reporting date. One refused element refreshes nothing. It never rewrites a title: it answers the ids of the slides whose rows changed, so the editor can ask the person to check those claims. It adds one Undo entry, and Undo brings back the earlier figures and date.

## Theme

A deck draws with the tenant branding on each read, never a copy: the company name in the footer, the primary color for the title rule (through core's `primaryPair`, so the app's default when the stored color or its foreground is not a valid hex value), the font key mapped to its face name (Arial for a key outside the four the branding accepts), and the light logo. With no logo, the footer shows the company name only. Every read and write of a deck answers a short-lived link for each image it shows, under `slides:read` on the deck, so an image a save adds or Undo brings back shows at once. The page keeps a link until about a minute before it expires and then takes the newest read's link; an image whose link has not arrived shows a placeholder.

## PowerPoint export

Export to PowerPoint needs `slides:read`: a person who can open a deck can present and export it. The server builds the file with pptxgenjs from the same slide layout the screen uses, so each slide places the same boxes. A bar, line, area or donut chart becomes a native, editable PowerPoint chart; a figure is its value and title as text; a table is a PowerPoint table. Each data element keeps its source caption, and each data slide shows its figures date. A data element whose dataset the person can no longer read is the refusal line, with no figure. Before it saves the file, the export uses jszip to drop each `[Content_Types].xml` override for a part that the zip does not hold. pptxgenjs 4.0.1 lists one slide master per slide but writes one (upstream #1444), and PowerPoint then shows its repair dialog. The file is saved through `FileStorage` with the person as uploader, named on `export_file_id`, and the previous export is removed in the same transaction. The answer is a short-lived download link under `slides:read` on the deck. Only a PNG or JPEG logo is placed in the footer; with an SVG logo the footer shows the company name only, because pptxgenjs cannot draw an SVG fallback on the server.

## Chat

A person who may ask gets the agent panel on the Slides list and on the deck page. On the Slides list it sends the page name only, `{ page: "Slides" }`, and no record. Its tools are `slides-list-decks` and `slides-read-deck` (`slides:read`), and `slides-create-deck` and `slides-change-deck` (`slides:write`, write tools). `slides-read-deck` answers the deck's content hash with its slides and their ids. The create tool runs only when the person's own message asks for a deck (R-46). It saves through the same store as New deck: every figure, chart and table passes the chart gate first, a refused chart saves nothing, the figures freeze on the reporting date, and one audit row names the tool. A create adds no Undo entry: Delete on the Slides list is the inverse of a chat create, as for analytics dashboards. The module's rules for the agent reach only a holder of `slides:write`: each slide makes one claim, its title states the finding, and every number comes from a figure, chart or table on the same slide (R-56). No tool output holds a clock value, a data row or the id of a deck the tool made, so a recorded follow-up request is the same on every run. `slides-change-deck` takes the deck id, the hash that `slides-read-deck` answered and the steps of one change, and runs only when the person's own message asks for that change. It saves through the same store as the deck editor: the owner check, the chart gate, the hash guard (a deck that changed since the read refuses the change), one Undo entry and one `slides:deck-changed` audit row. The person reverses it with Undo on the deck. A figure, chart or table sent back with its chart config as read keeps its frozen data. The change output holds each slide's number, id and title and no hash: the hash covers the frozen data and its read time, so a second change reads the deck again (PC13). Both deck tool descriptions state the slide layout, the text limits of `contract.ts`, the data size limits and the chart gate rules of core's `CHART_PROMPT_RULES`, so a first call passes (`czjw.79`). On the deck page the agent panel gets `{ page: "Deck", record: { type: "slides-deck", id }, part: { type: "slide", id } }`, the shown slide as the part, and reads the deck again when an answer ends (D21).

## Not built

Shared decks, Word documents, freely positioned objects, edits by chat.

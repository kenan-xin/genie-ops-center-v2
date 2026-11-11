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

## Position and style

An element can have its own box on the 960 by 540 slide, in whole canvas pixels. Without a box, it keeps the computed layout. A box must stay inside the slide. A title, text or bullet list needs at least 80 by 32, and a figure, chart, table or image at least 160 by 96. The editor snaps a drag or a resize to 8 pixels.

A title, text or bullet list takes a text color, a font size of 12, 14, 18, 24, 32, 40 or 56, a weight (regular, semibold or bold), an alignment (left, center or right), a fill and a border. A figure, chart, table or image takes only a fill and a border, and a chart keeps the theme's colors. A border is 0, 1, 2 or 4 pixels wide, with no radius. A slide can have a background. Colors are 6-digit hex values.

The save checks the contrast of every text: at least 4.5:1, or 3:1 from font size 24. The text is checked against its own fill, else the slide background, else the theme background `#FFFFFF`. A text without a color is checked in the theme's text color `#111827`, so a background change re-checks every text without a fill. A refused change saves nothing and names the element. A hand background pick also changes, in the same change, the color of each text without a fill that falls below its limit, to the theme text color, white or black. The deck page then says "Text colors changed to stay readable." with Undo, until the next save.

Two steps change these fields: `change-element` sets the box or the style of one element, and `change-slide-fields` sets the background or the speaker notes of one slide. Each sets only the fields it names, and `null` clears one. A style change sets or clears each named key and keeps the others. `add-slide` and `change-slide` can carry boxes, styles and a background. A `change-slide` step that names no background keeps the slide's background. An element of a `change-slide` step keeps the box and the style of the stored element at its place with its kind when the step leaves them out, and `null` clears them. The hand editor states every element's box and style, so a removed element's box never moves to the next one. One change is one Undo entry. The screen, present mode and the PowerPoint export draw the same boxes, colors, fills, borders, font sizes and alignments.

## Speaker notes

A slide may carry notes: plain text of at most 2,000 characters (JavaScript string length, the textarea's `maxLength` unit), stored with their newlines and never trimmed. A stored note is never blank; the editor sends `null` to clear a field that holds only spaces. `change-slide-fields` sets or clears them with one Undo entry, and `add-slide` and `change-slide` may carry them; a `change-slide` that names no notes keeps them. The person types them in the Speaker notes field under the slide, at every width, which saves after a pause. The Edit slide sheet holds no notes.

Notes show in two places only: the presenter window and the PowerPoint export, which writes them as each slide's PowerPoint notes. Present with notes opens the presenter window at `/m/slides/decks/:id/presenter` beside present mode: the current slide, the next slide, the notes, each non-blank line as a paragraph, and a timer. The two windows follow each other over the `BroadcastChannel` `slides-present:<deckId>`: each move posts `show`, and on open the presenter asks for the shown slide. A browser that blocks the pop-up gets a page note and no audience-only show.

The agent writes notes only when the person asks, with a `change-slide-fields` step, and `slides-read-deck` answers each slide's notes. Notes hold no figure that the slide does not show (R-56); this is an agent rule, and no code checks it.

## Refresh data

Refresh data reads every figure, chart and table of the deck again through the chart gate, needs `slides:write` and the content hash the person read, and sets `frozen_on` to the reporting date. One refused element refreshes nothing. It never rewrites a title: it answers the ids of the slides whose rows changed, so the editor can ask the person to check those claims. It adds one Undo entry, and Undo brings back the earlier figures and date.

## Theme

A deck draws with the tenant branding on each read, never a copy: the company name in the footer, the primary color for the title rule (through core's `primaryPair`, so the app's default when the stored color or its foreground is not a valid hex value), the font key mapped to its face name (Arial for a key outside the four the branding accepts), and the light logo. With no logo, the footer shows the company name only. Every read and write of a deck answers a short-lived link for each image it shows, under `slides:read` on the deck, so an image a save adds or Undo brings back shows at once. The page keeps a link until about a minute before it expires and then takes the newest read's link; an image whose link has not arrived shows a placeholder.

## PowerPoint export

Export to PowerPoint needs `slides:read`: a person who can open a deck can present and export it. The server builds the file with pptxgenjs from the same slide layout the screen uses, so each slide places the same boxes. A bar, line, area or donut chart becomes a native, editable PowerPoint chart; a figure is its value and title as text; a table is a PowerPoint table. Each data element keeps its source caption, and each data slide shows its figures date. Each slide's footer, the company name, the slide number and the figures date, takes the slide's footer color, as the screen draws it. A data element whose dataset the person can no longer read is the refusal line, with no figure. Before it saves the file, the export uses jszip to drop each `[Content_Types].xml` override for a part that the zip does not hold. pptxgenjs 4.0.1 lists one slide master per slide but writes one (upstream #1444), and PowerPoint then shows its repair dialog. The file is saved through `FileStorage` with the person as uploader, named on `export_file_id`, and the previous export is removed in the same transaction. The answer is a short-lived download link under `slides:read` on the deck. Only a PNG or JPEG logo is placed in the footer; with an SVG logo the footer shows the company name only, because pptxgenjs cannot draw an SVG fallback on the server.

## Chat

A person who may ask gets the agent panel on the Slides list and on the deck page. On the Slides list it sends the page name only, `{ page: "Slides" }`, and no record, and the panel is Ask.

Ask and every Slides chat get the read tools `slides-list-decks` and `slides-read-deck` (`slides:read`) and one read rule for a holder of `slides:read`: the tools read only the person's own decks. `slides-read-deck` answers the deck's content hash with its slides and their ids.

The module declares the agent surface "Slides agent" in `src/agent-surface.ts`, on the deck page `/m/slides/decks/:id`, and it accepts a handoff from Ask (`DEC-29`, amended 2026-11-07; S7-42). Only a Slides chat of a holder of `slides:write` gets the write tools `slides-create-deck` and `slides-change-deck` and the surface's rules, and Ask offers a holder of `slides:write` the handoff to it. The rules say that the chat's deck is its record, that a change runs only when the person's own message or a brief from Ask asks for it (R-46), that a deck is built slide by slide with one `add-slide` step per `slides-change-deck` call and no read in between, that a second deck is made only when the person asks for one, that Try again reads the deck first, and that a chart or a table with no place named first offers Add and Just show it here as buttons, through core's `offer-choices` tool. They also hold the slide rules: each slide makes one claim, its title states the finding, every number comes from a figure, chart or table on the same slide, and speaker notes hold no figure that the slide does not show (R-56).

The surface's `createRecord` checks `slides:write` and inserts the empty deck with its created audit row through the handoff's transaction, frozen on the reporting date, with the same insert as New deck. It adds no Undo entry: Delete on the Slides list is its inverse.

The create tool saves through the same store as New deck: every figure, chart and table passes the chart gate first, a refused chart saves nothing, the figures freeze on the reporting date, and one audit row names the tool. No read tool output holds a clock value, a data row or the id of a deck the tool made. `slides-change-deck` takes the deck id, the hash that `slides-read-deck` or the last change answered, and the steps of one change. It saves through the same store as the deck editor: the owner check, the chart gate, the hash guard (a deck that changed since then refuses the change), one Undo entry and one `slides:deck-changed` audit row. A change that leaves the deck as it is saves nothing and adds neither. The person reverses it with Undo on the deck. A figure, chart or table sent back with its chart config as read keeps its frozen data. A `change-slide` step replaces the slide's elements, so an element sent without its box and style loses them. The tool description tells the agent to send them as read. The change output holds the new content hash and each slide's number, id and title, so a five-slide build fits the step limit with no read between slides. This ends PC13: the hash varies with the read time of the figures, and the replay transport renames it (P11-43). Both deck tool descriptions state the slide layout, the text limits of `contract.ts`, the data size limits, the chart gate rules of core's `CHART_PROMPT_RULES`, and the notes rule (at most 2,000 characters, shown only in the presenter window and the export, set or cleared with a `change-slide-fields` step), so a first call passes (`czjw.79`). On the deck page the agent panel gets `{ page: "Deck", record: { type: "slides-deck", id }, part: { type: "slide", id } }`, the shown slide as the part, and reads the deck again when an answer ends (D21). A change whose steps leave the deck as it is saves nothing, and the tool's answer says so, so the agent offers no Undo.

## Not built

Shared decks, Word documents.

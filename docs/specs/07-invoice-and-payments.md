# Section 7: Invoice and payments, with chat, dashboards and slides

Confidence: 7.4/10

Reasoning: the product behavior is settled one decision at a time with the owner, and two cold critiques tested the plan and the tickets against the code. The score is lower than earlier sections for three reasons. Four new parts must land in about five weeks with no slip order. The model calls depend on an outside service (OpenRouter) and on models that change. Several core seams are new (datasets, the chart gate, the agent runtime, the typed key store), and none of them exists in code yet.

Status: Approved by the owner, 2026-10-27. The owner approved the ticket breakdown on the same day. Amended 2026-11-01 with the owner rulings of wave 3: R-15, R-26, R-46, R-49 and R-52. Amended 2026-11-03 with the owner rulings of the Ask review in the wave 4 dry run: R-41, R-42, R-42a, R-45a and AC-8 (`DEC-56`), and later that day R-42 and R-42a again (agent panel, collapsed history, step timeline). Amended 2026-11-03 with the owner rulings of the wave 4 review: R-35, R-37, R-37a, R-38a, R-44, R-44a, AC-7 and AC-8. Amended 2026-11-04: R-28 (`czjw.72`). Amended 2026-11-08 with the wave 5 rulings, approved by the owner on 2026-11-08 (gate G1 of follow-up 11), together with the tickets S7-40 to S7-47: R-42, R-42b, R-43, R-46, R-46a, R-49, R-49a, R-52, R-52a, R-55a, R-56, AC-8, AC-13 to AC-15 and Deferred. Sources: the approved `DEC-29` amendment (surface agents and the Ask handoff), `czjw.113`, `czjw.103`, `czjw.104`, `czjw.115`, `czjw.116`, `czjw.117`, and the owner's tech plan decisions of 2026-11-08 in `../tech-plans/07-invoice-and-payments.md`, wave 5.

## Goal and scope

Section 7 delivers an AI-assisted invoice and payment tracker, and the core seams and modules it needs, for a demo at a fintech festival in November 2026. A person uploads invoices and payment evidence in any order. A model reads each document, the person completes what is missing, and the system keeps reliable records with correct balances. The person then asks questions, builds dashboards and creates slide decks from those records by chat.

In scope:

- Core: module pages and a typed browser client (roadmap Section 6 items 1 and 2), the dataset seam (closes `OPEN-11`), the chart write gate, the model connection with a typed key store (the model part of Section 6 item 4, `DEC-53`), the module audit call, job retries and a job principal, the reporting-date setting, and the boss agent of `DEC-29` with the Ask page and the agent panel (the chat bubble until 2026-11-03).
- The Invoice and Payments module.
- The Analytics module and the Slides module, which serve any module's datasets.
- An evaluation suite that picks the models, and a demo deployment seeded from the demo pack.

Out of scope: foreign exchange, credit notes, refunds, write-offs, bank reconciliation, accrual accounting and tax rules. The rest of Section 6 (relation scopes, the full outbound HTTP service, notifications, the `s3` adapter) stays in Spec 6 epic `215x`. The Solutions module (Section 4) waits until this section is done.

Boundary with earlier sections. Sections 0 to 3 deliver the module contract, the tenant context, `can()` and `scopesFor()`, the audit log, the job worker, `FileStorage`, the shell and the design system. This section extends the module contract in core, documents each extension in `../architecture/module-contract.md`, and proves each one on the placeholder module.

## Sources

Planning artifacts, kept with the planning notes: the epic brief, the core flows, the technical plan and its two critiques, the ticket critique, and the chart research of 2026-10-27. The repository copy of the technical plan is `../tech-plans/07-invoice-and-payments.md`.

Module documents: `../modules/invoices-and-payments/README.md`, `../modules/analytics/README.md`, `../modules/slides/README.md`. Demo data: `../modules/invoices-and-payments/demo-pack/` (fictional).

Decisions: `../core/decision-log.md` `DEC-20`, `DEC-25`, `DEC-28`, `DEC-29` (amended 2026-10-27 and 2026-11-01), `DEC-34`, `DEC-39`, `DEC-46`, `DEC-53`, `DEC-54`, `DEC-55`.

Architecture: `../architecture/module-contract.md`, `../architecture/data-shape.md`, `../architecture/ui-development.md`.

Design: `../design/prototypes/invoice-upload-review.prototype.html` (variant D) and `../design/sections/invoices-and-payments/`.

## Requirements

### Module pages and browser client (roadmap Section 6 items 1 and 2)

R-1. A module declares pages with nested routes, route parameters, server-side data loading and a permission per route, composed on the oRPC module contracts of ADR 0011. A route refuses a person who lacks its permission before any data loads.

R-1a. A nested module route declares its parent route. The core page header shows a breadcrumb on a nested page (desktop) and a back link to the parent (phones), with the record label from the module's record resolver. A top-level page shows none.

R-2. A module calls its own procedures from the browser through a typed client that core provides. The client carries no module name in core.

### Dataset seam (closes `OPEN-11`, `DEC-54`)

R-3. A module may declare datasets. A dataset declares a name, a description for the agent, a permission key, fields (each a dimension or a measure, with a type of text, date, number, money or boolean, and a description), one time field, a record key (record type and id field), and a currency field when any field is money.

R-4. A dataset's `source(ctx, asOf)` is async and returns a select that already applies `scopesFor()` for the caller. Core never names a module table. It composes only over the select that `source()` returns.

R-5. Core offers `listDatasets`, `queryDataset` and `queryDatasetSeries` to every caller. Each checks the dataset permission with `can()` first and skips a dataset whose module is disabled.

R-6. A query has one generic shape: select, filters (`eq`, `neq`, `in`, `gt`, `gte`, `lt`, `lte`, `between`, `isNull`), group by (a field, a date field by month or week, or a number field by labelled ranges), aggregates (`sum`, `count`, `avg`, `min`, `max`), order by and limit. A value outside every range, or null, falls into no range bucket.

R-7. A multi-series query runs one query per series, each on its own dataset and permission, and joins the results on a shared x value. All series group x by the same type and bucket. A missing value stays empty and is never zero.

R-8. Core validates a query against the declared fields before it builds any SQL. A query returns at most 1,000 rows and stops after 5 seconds. A sum or average over a money field is refused unless the result holds one currency or groups by the currency field.

### Reporting date, module audit and jobs

R-9. One core reporting-date setting, a nullable column on `tenant_settings`, read through the cached settings reader (`DEC-46`). Blank means today in the tenant's default time zone. Every dataset query, the agent prompt, dashboard date ranges and deck freeze dates use it.

R-10. A module writes audit rows through a module audit call, `audit(action, target, summary, metadata)`, with actions prefixed by the module id, as `../architecture/module-contract.md` already promises.

R-11. A record route turns a dataset row's record key into the record's page path through the owning module's record-type resolver, under `can()`.

R-12. A job declaration may set a retry limit and a backoff. A job started by a person runs as that person, so it can call `can()` and write audit rows for them. A module procedure can enqueue its own job. This folds deferred bead `d8l5.22`.

R-13. A capability is registered with its owning module id. The capability registry gains a list form that returns every provider of one interface, skipping a provider whose module is disabled.

### Chart write gate

R-14. A panel config holds a chart type (KPI, bar, line, area, donut or table), one or more series, each a query in the shape of R-6, the field on each axis, and a title. Each chart type has a closed list of keys.

R-15. One core gate checks a chart before anyone saves or shows it: the config passes its schema, every query runs, every configured field is a returned column of a type that fits the chart, a line or area chart has an ordered x-axis, a donut has non-negative parts of one whole, no chart has a second y-axis, and no chart has more than 8 series. An empty result is valid and shows an empty state. A failure saves nothing and returns the missing keys and a fix hint. A frozen deck chart gets this full check when the deck is made and on Refresh data. When the deck is opened, it gets only the read-access check, which hides a chart whose dataset the person can no longer read (R-54; owner, 2026-11-01).

R-16. One chart component draws every chart in Analytics, Slides and chat, on the shadcn Chart component. It has a table view, a caption that names the dataset and the time the data was read, and stable series colors.

### Model connection (part of `OPEN-12`, `DEC-55`)

R-17. An administrator types the model provider key on a write-only field. Core stores it under `DEC-53`. The screen shows "Stored" and never the value. No response, log, error or audit row contains it.

R-18. Settings hold the allowed model ids, a chat default and a document-reading default. A person picks an allowed model per chat session. Document reading always uses its default.

R-19. One core function builds every model with the stored key, OpenRouter through `@openrouter/ai-sdk-provider`, an allowed host, a timeout, and provider preferences that deny data collection.

R-20. With no stored key, every AI feature shows that it is off, and the rest of the product works.

R-21. Gate and end-to-end tests use a recorded test model that replays stored responses. No test in `pnpm gate:merge` calls a live model.

### Invoice and Payments module

R-22. The module owns customers, documents, invoices, payments, allocations, field origins and allocation events. Amounts are integer cents with a currency code. A balance is the invoice total minus its allocations and is never stored.

R-23. An upload stores the bytes through `FileStorage` with a SHA-256 hash. An exact copy creates nothing and shows Duplicate, nothing added.

R-24. A reading job extracts the PDF text layer with page markers and sends it to the document-reading model with a structured-output schema. A model that accepts files also gets the PDF. Each field returns its value, the quoted source text and the page. The model never matches, links or computes a balance.

R-25. The server checks each quote against the text layer after normalising whitespace, line breaks and number formats. A value whose quote is not in the text is dropped, and the field shows "check this".

R-26. The reading job retries twice with backoff and is idempotent per document. After the retries the document shows Could not read with Retry. A Could not read document keeps Retry, and its review also offers the type select and empty fields, so a person enters it by hand. Every field saved this way gets `field_origin` `corrected`. `setDocumentKind` accepts `could-not-read`. A stalled `reading` still needs Retry first (owner, 2026-11-01). A partial reading keeps its valid fields. With AI off, or a PDF with no text layer, the person fills the fields by hand.

R-27. The model classifies each document as an invoice, payment evidence, a paid receipt or a purchase order. The person can change the type in the review.

R-28. A missing due date blocks saving until the person enters a date or marks it unspecified. A paid receipt is the exception: it is paid in full at once, so its review asks no due date, keeps a due date that the document states, and saves a missing one as unspecified (`czjw.72`). Missing payment terms stay blank. The system never fills either. A due date has a source: document, person or unspecified.

R-29. An invoice saves as unpaid and joins outstanding at once. An unspecified due date is never overdue.

R-30. A payment is created as a draft from its reading. It links automatically only when it names one invoice of the same customer, its amount is no more than that invoice's open balance, and the customer, invoice number and amount all passed the quote check. Every other case waits for the person: a split proposal, suggestions by customer and amount, or a choice for an overpayment.

R-31. A payment with no match is saved as Unallocated. It counts in collections and changes no invoice balance. When an invoice it names is saved later, R-30 applies.

R-32. Any link can be removed or changed from the invoice or the payment. A removed amount returns to the payment as Unallocated. An automatic link shows Undo. Every change writes an allocation event and an audit row. Correcting an invoice total below its allocations asks which link to reduce.

R-33. A different file with the same key facts shows Possible duplicate, and the person keeps or discards it. A paid receipt creates one invoice, one payment and one allocation. A purchase order changes no figure.

R-34. Linking locks the invoice row. A unique index holds the document hash. Allocations never exceed the invoice total or the payment amount.

R-35. The module publishes datasets `invoices`, `payments` and `customers` with the measures of R-36. The `invoices` dataset declares the summary fields of R-44: the invoice number, the customer and the outstanding amount (owner, 2026-11-03, `czjw.59` ruling 3).

R-36. The measures, used by every part of this section and no others: invoiced sales are invoice totals by invoice date; collections are payments by payment date; outstanding is invoice totals minus allocated payments; overdue is outstanding with a known due date strictly before the reporting date; repeated late payment is a stated count of fully settled invoices with a known due date, paid after it.

R-37. The Documents inbox lists every document with its type, what was found and its status: Reading, Could not read, Needs your input, Linked automatically, Confirm the split, Possible duplicate, Duplicate (nothing added), No matching invoice, Kept as a reference, Saved. The inbox uses the list header of R-37a. Status tabs with counts (Needs you, Reading, Done, All) replace the inbox groups. Its filter bar holds a search over the file name, the customer and the number, the document type and the uploaded date range. The table has an Updated column. Upload stays in the page header (owner, 2026-11-03, `czjw.73`).

R-37a. The Invoices list, the Payments list and the Documents inbox use one list header, variant C of `list-filters.prototype.html` in the design workspace (owner, 2026-11-03, `czjw.73`). A figure strip sits above the table card: every figure has a caption, a value and a sub-line on shared baselines, and on a phone the lead figure is full width with the others in a 2 by 2 grid. The figures read the whole ledger that the person can see, as of the reporting date: the tab, the search, the customer and the date range change the tab counts and the rows, never a figure (owner, 2026-11-07, `czjw.112`). Status tabs with counts sit on the top edge of the table card, Overdue in red and Not linked in amber. A compact filter bar sits inside the card header: search, a customer picker and a date range picker, with Clear filters at its end. Every control has one height. A placeholder is grey and regular, and a set value is tinted and semibold. Column headers sort, and Updated sorts newest first by default. Filter state lives in the URL. Filters past the width of the bar move into a More filters popover on a desktop and into one Filters sheet on a phone, the tabs fold into a select or a scrolling row, and the table becomes the card list. The three lists are three configurations of one header component, with no per-list code in it (module contract, list header).

R-38. Opening a document shows the full-page review of variant D: the document on the left, the fields on the right, each with its origin tag (Extracted, Entered by you, Corrected by you). Selecting a field highlights its source text on the document. On a phone, the document and fields stack.

R-38a. The invoice record page and the payment record page show the document desk, variant C of `invoice-record.prototype.html` in the design workspace (owner, 2026-11-03, `czjw.84`). The PDF page shows inside the record page without a click. On a desktop the page sits in the center, and each read field is pinned beside its source line by a leader line, placed by the same text-layer match as the highlights of R-38. Links and history sit in a side drawer. The status and the amounts sit above the page, with Outstanding the largest, then Total, Paid and the due date. On a phone the page comes first, and the record opens in a bottom sheet that peeks with the status and the outstanding amount. Each field keeps its origin tag, and the link actions of R-32 stay (Undo, Change amount, Remove link, the total correction). A field with no quote, or a PDF with no text layer, gets no pin and is listed beside the page. A record entered by hand has no page and shows the record full width. A PDF that fails to load offers Download and Try again.

R-39. The module declares `invoices:read` and `invoices:write` and default roles Invoices and Payments editor (both) and Invoices and Payments viewer (read). Renamed 2026-11-08 from Finance and Viewer, with their ids and assignments (`czjw.100`).

### Boss agent (`DEC-29`)

R-40. The agent route handler lives in core and the app mounts it. Messages stream as AI SDK message parts.

R-41. Core stores agent sessions, messages, including tool results, and the artifacts of R-45a with their versions. Only the owner opens a session and its artifacts. Amended 2026-11-08 (`czjw.120`): the owner renames or deletes a chat. Delete removes its messages, artifacts and made files.

The boss agent, Ask and the agent panel are core and module-agnostic: they work the same whether the deployment runs finance, healthcare, legal or CRM modules. Their screens, labels and artifact kinds never name a module's domain; a module's words appear only as content from its datasets and tools (owner, 2026-11-03).

R-42. The Ask page lists the person's sessions and shows one. The agent panel on every page except Ask starts a new session each time it opens (owner, 2026-11-03: a full-height panel docked on the right, not a floating bubble). On a desktop it pushes the page narrower and never covers it; on a phone it is a full-screen sheet. An Agent button in the top bar opens and closes it, and its status dot shows while the agent works, also with the panel closed. The same panel replaces a page's own chat, so a dashboard or a deck editor has no second chat; the panel names the open record through the page context. On a page whose module declares an agent surface (R-42b), the panel is that surface's agent and lists that surface's sessions, this record's first; on every other page it lists Ask's sessions. An empty new chat shows one line for each module inbox the person can read, and the line names no module in core's own words (amended 2026-11-08, `czjw.120`). Chat takes no file upload. A core permission gates Ask. The main menu lists Ask for a person who holds that permission.

R-42a. Layout of Ask (owner, 2026-11-03). On Ask, the main menu opens as its icon rail and the chat history opens beside it; on every other page the main menu stays open. The chat history collapses on its own toggle and then hides completely, with no second rail; only its toggle stays, in the Ask top bar. In Ask and the agent panel, tool work shows as a step timeline: the active step moves, older steps fold, repeated reads of one source group into one step with a count, a call that was refused and then fixed is one step, a final refusal is a clear failure with Try again, and before the first step a Thinking state moves. A step that runs past 3 seconds shows its elapsed time. Ask and the agent panel give one chat experience through one shared set of core components (messages, step timeline, streaming, Stop, composer, artifact card); only the frame differs (owner, 2026-11-03). Answers stream word by word as the model writes them, never all at once at the end. Stop keeps the text so far. The composer shows one focus ring, and Send stays disabled until the composer holds text. The prototype is `ask-chat.prototype.html`, variant B, in the design workspace.

R-42b. Surface agents and the Ask handoff (owner, 2026-11-07 and 2026-11-08, amended `DEC-29`, `czjw.113`). A module may declare one agent surface: a name, its record page, its tools, its instructions, and whether it accepts a handoff. Core runs every surface; no module runs an agent of its own. A session belongs to one surface: Ask, or one module surface bound to one record. When the person's own message in Ask asks for a deck or a dashboard, Ask hands the work over: it writes a brief (the goal, the facts from the chat with their dataset and date, the datasets, the period, the charts of the chat, and what it did not pass), creates the empty deck or dashboard and a session on the target surface with the brief as its first message, starts the run on the server, and opens the target page. The rest of the Ask chat is never passed. The target agent queries the datasets again as the person, so every figure it saves comes from a fresh query. The run continues when the person leaves the page; Ask keeps a card with the live status and a link, and the target page shows the brief, the steps, the text and each slide or panel as it saves, each within about a second, not word by word as in R-42a. Stop on the target page ends the run within about a second, including a model call in progress. A run that a restart interrupted says so and offers Try again. Each person has at most one handoff building at a time. Ask's history lists only Ask chats. The prototype is `agent-handoff.prototype.html`, variant A, in the design workspace.

R-43. The agent's tools are `list-datasets` (names and descriptions first), `query-dataset` (fields of one dataset), `open-record` (R-11), and the tools that modules provide through the `agent-tools` interface. Core names no module tool. Amended 2026-11-08: an Ask session also has core's `hand-over` tool and no surface tools; a surface session has its surface's tools, `list-datasets`, `query-dataset`, `open-record` and the artifact tool of R-45a, and no `hand-over`.

R-44. An answer states the reporting date, uses only the measures of R-36, shows how each figure was calculated, and lists the records behind it as rows that open the record. A question the records cannot answer is refused.

Amended 2026-11-03 (owner rulings on `czjw.59`). An answer is short and in simple English. It gives the result first in one short sentence, then short sentences. It uses plain words and labels, never an internal dataset or field name, and writes dates as a person reads them, never as ISO dates. It uses a list only for three or more items. The method follows the result. An answer about money states the total first, then the rows. A list answer shows a short top list of about 5 rows and a line that says how many more there are, and the person can ask for more. A dataset may declare summary fields, and every list of that dataset's rows shows them, plus the columns that the question is about (module contract, datasets).

R-44a. Full lists (owner, 2026-11-03, `czjw.85`). A large row count never renders in the chat. For a full list the agent offers one of three things. A table or record-list artifact (R-45a) stores only its query definition, so it opens at once and runs as the viewer, with no model work. A file in Markdown, CSV, Excel or PDF comes from a core background job (`DEC-12`) that runs the dataset query as the person (R-12), writes the file through `FileStorage`, writes an audit row and posts the download link into the chat. The agent picks the format by the data and the request. Core owns the file kinds, and a module adds none. A written document artifact, for prose such as a report, is the one case that uses a background model run, and its card shows that it is being written. While a file job or a document run works, the person keeps chatting, and the step timeline shows its state.

R-45. Chat answers render through OpenUI `@openuidev/react-lang` with a catalog of our own components. Every chart and table takes a checked panel config, never typed values. Repair is local. The `lang-core` install script is denied in `allowBuilds`, and `OPENUI_TELEMETRY_DISABLED=1` is set. `@openuidev/react-ui` is never installed. The prose of an answer is styled by a shadcn Typeset preset, `typeset-chat`, that matches the design tokens, and the OpenUI components are marked `not-typeset`.

R-45a. Artifacts (owner, 2026-11-03, `DEC-56`). A chart, a table, a document or a record list that an answer makes is an artifact. In the answer it shows as a compact card with its kind, title and version, the same on a phone and on a desktop. Selecting the card opens the artifact panel: on a desktop beside the chat, which stays visible, and on a phone as a full-screen sheet. The panel does not open by itself. It lists every artifact of the chat, not only the latest answer's. A change request on an artifact ("show it as a line by month") makes a new version of the same artifact, and the panel steps between its versions. A version stores the artifact's definition, never its figures, so opening any version runs its query again as the viewer. The panel offers Copy, Download and, for a table, the records behind it. Core owns the panel and the kinds chart, table, document and record list.

R-46. Tool results and document text are data, never instructions. A write tool runs only on an explicit request in the person's own message. Undo reverses a chat change to an existing dashboard or deck. Delete reverses a chat create (`analytics-create-dashboard`, `slides-create-deck`) (owner, 2026-11-01). The agent never creates, changes or links invoices and payments. Amended 2026-11-08 (`czjw.96`): on a dashboard or deck page, a request for a chart or a table first asks whether to add it to the open record; the choice counts as the person's request, and Add uses the surface's write tool with Undo.

R-46a. When a request is outside the agent's tools, the agent says in one sentence what it can change, offers the nearest change it can make, and never names a tool that does not exist (owner, 2026-11-08, `czjw.104`). This holds for Ask and for every surface.

R-47. Every tool call writes an audit row with the tool, the dataset, the query and the row count, never the returned rows.

### Analytics module

R-48. A dashboard is saved per owner with a config of filters and panels (R-14). Only its owner opens it.

R-49. The person builds and changes a dashboard by chat beside it, or by hand: move, resize, rename, delete, chart type, filters. Dashboard filters apply to every panel. Every save passes the gate of R-15. Amended 2026-11-08 (`czjw.116`): a dashboard has a date range and up to four field filters. A text field offers select or multi-select, a true-or-false field offers a toggle; the kind follows the dataset's declared field type. A panel may keep its own date range, and then shows it in its header. The current filters live in the page address, so a link or a reload opens the same view; changing a filter saves nothing. The dashboard opens with its default filters, and Save as default stores the current ones with Undo. Filter values reach each panel only through its typed dataset query, as the person (R-12). A field filter applies to each panel whose dataset has that field; a panel it does not apply to says so. Every chat change to an existing dashboard has Undo. Delete reverses a dashboard that chat created (R-46).

R-49a. Saved views (owner, 2026-11-08, `czjw.117`). The person saves the current filters of a dashboard as a named view, switches between views, updates or removes one, and makes one view the default that the dashboard opens with. Save as default always stores the current filters as the dashboard's own default, so a change is never lost. A view holds filter values only, never panels. Each change has Undo. The Dashboards agent can save a view and set the default on the person's request.

R-50. A panel refetches every 10 seconds and when the window regains focus.

R-51. The module declares `analytics:read` and `analytics:write` with default roles. The demo seed writes the Receivables overview starter dashboard.

### Slides module

R-52. A deck is typed elements on 16:9 slides: title, text, bullet list, figure, chart, table and image. It is saved per owner, and only its owner opens the deck page. An image or export link of a deck opens for any `slides:read` holder for its 5-minute life, because sharing a deck today means exporting it and sending the file (owner, 2026-11-01). Shared decks stay deferred.

R-52a. Position and style per element (owner, 2026-11-07 and 2026-11-08, `czjw.103`). An element may have its own box on the 960 by 540 slide; without one it keeps the computed layout. Title, text and bullets take a text color, a font size from a fixed scale, a weight, an alignment, a fill and a border; figures, charts, tables and images take a fill and a border, and a chart keeps the theme's colors. A slide may have a background. Any hex color is allowed; a text color below 4.5:1 against what is behind it (3:1 for large text) is refused, and a refused change saves nothing. The slide rules of D5 stay. The person moves, resizes and styles an element by hand, and the agent does the same by chat; each change has Undo. The PowerPoint export draws the same boxes and styles. The editor controls follow the prototype the owner picks at gate G2 of follow-up 11.

R-53. Edits are patch operations guarded by the content hash, so an edit made on an older version is refused.

R-54. A deck freezes its figures when it is made and shows that date on each data slide. Only Refresh data changes them.

R-55. A deck uses the tenant branding. The person can present it full screen, and export it to PowerPoint with native editable charts through pptxgenjs, saved through `FileStorage`.

R-55a. Speaker notes and a presenter view (owner, 2026-11-07, `czjw.115`). Each slide may have plain-text notes. The person writes them under the slide, and the agent may write them on request. Presenting opens a presenter window with the current slide, the next slide, the notes and a timer, and it follows the audience window. The PowerPoint export writes the notes. Live transcription is not built: it sends audio to a third party.

R-56. The agent writes one claim per slide, with a title that states the finding. Amended 2026-11-08: notes hold no figure that the slide does not show.

R-57. The module declares `slides:read` and `slides:write` with default roles.

### Evaluation and demo

R-58. An evaluation script, outside `pnpm gate:merge`, scores the candidate models on two tracks: extraction of the seven live uploads, and the nine read questions plus about 14 chart cases at reporting date 2026-10-27. Each case runs three times per model. A committed report gives pass rate, variance, cost and time, and the recommended defaults.

R-59. A demo tenant includes the three modules. A seed script loads the demo pack history and gives the demo account one role per module, the module's editor role, and `Ask user`. A later run removes only the extra roles that an earlier run granted (amended 2026-11-08, `czjw.99`: the seed gave every Section 7 role, which breaks one role per module).

R-60. Every new screen works at a phone and a desktop viewport (`DEC-25`).

## Acceptance criteria

AC-1. The placeholder module shows a page with a route parameter, calls its own procedure from the browser with types, and is refused without the route's permission, at both viewports. Proves R-1, R-2.

AC-2. Integration tests on the placeholder datasets prove grouped totals, range buckets, a two-series join with an empty gap, refusal without permission, an unknown field refused before SQL, the row cap, the time limit, a money aggregate refused across currencies, and a disabled module's dataset skipped. The standing tenant isolation test reads one dataset. Proves R-3 to R-8, R-13.

AC-3. Integration tests prove the reporting-date setting changes a dataset result, a placeholder audit action, a record route, a job that checks `can()` for its starter, and a retried job. Proves R-9 to R-12.

AC-4. Unit tests prove each chart-type rule with a failing and a passing config. Integration tests prove the query and column checks. The chart component's stories pass at both viewports in light and dark. Proves R-14 to R-16.

AC-5. An administrator stores a key that never appears in a response, log or audit row. A model call reaches only the allowed host and stops at its timeout. With no key, AI features show off. The gate runs with no network access. Proves R-17 to R-21.

AC-6. Integration tests on the demo pack history give every total in `expected_baseline_answers.json` and every answer in the module's expected-answers file at 2026-10-27, and cover each matching and correction rule. Proves R-22, R-29 to R-36, R-39.

AC-7. With the recorded test model, the seven live uploads reach the expected statuses and records, and the end-to-end review flow gives the results in `expected_live_running_totals.json`, at both viewports. The Invoices list, the Payments list and the Documents inbox show the list header of R-37a, and the invoice and payment records show the document desk of R-38a, at both viewports. Proves R-23 to R-28, R-37, R-37a, R-38, R-38a.

AC-8. With the recorded test model, the nine read questions match the expected-answers file, a person without `invoices:read` is refused, a disabled module's tools are absent, and the agent panel on a page with no surface lists Ask's sessions (amended 2026-11-08), at both viewports. The agent panel opens from the Agent button, pushes the page on a desktop, and shows the step timeline while it works. A change request on a chart makes version 2 of the same artifact, the panel steps back to version 1, and a phone opens the artifact as a sheet. A list question shows about 5 rows with the dataset's summary fields and a line for the rest, and offers a table artifact and a file, and the file holds every row the person may read and no other. Proves R-40 to R-47, with R-42a, R-44a and R-45a.

AC-9. The starter dashboard shows the expected totals. A dashboard built by chat refreshes after a payment is saved, at both viewports. Proves R-48 to R-51.

AC-10. The five-slide monthly sales and collections deck is created by chat and presented, and its export parses as a valid file with native chart parts, at both viewports. Proves R-52 to R-57.

AC-11. The evaluation report and the recommended defaults are committed. Proves R-58.

AC-12. One end-to-end test runs the ten demo-script steps on a seeded demo deployment at both viewports. The owner signs off a live dry run, including opening the exported deck in PowerPoint. Proves R-59, R-60.

AC-13. With scripted model fixtures, and after the live re-recording with the recorded test model, a request in Ask for a deck hands over: the deck page opens, the brief card shows what Ask passed, slides appear one by one, and the run finishes after the client disconnects. Ask's history has no Slides chat, and the deck page lists the chat under the Slides chats. The same holds for a dashboard. Stop on the target page ends the run, also during a model call. An integration test proves the session, the audit row naming both sessions and the record link. A request outside the tools gets the answer of R-46a. On a dashboard, a chart request asks first, Add makes a panel with Undo. At both viewports. Proves R-42, R-42b, R-43, R-46, R-46a.

AC-14. A chat request "make the title slide dark blue with white text" changes the deck, and Undo reverses it. A drag moves an element and a resize changes its box, each with one Undo entry. A text color below the contrast limit is refused and saves nothing. Notes save, undo and reach the exported file's notes, and the exported file draws the same boxes and colors. The presenter window follows the audience window at desktop; the phone edits notes in the editor sheet. Proves R-52a, R-55a, R-56.

AC-15. Two filters set on a dashboard survive a reload and open the same view from a copied link in a new tab; a stored single field filter reads as a list of one. A filter narrows every panel whose dataset has the field, within the person's scopes, and the other panels say it does not apply. Save as default, a saved view, switching and the default view survive a reload. At both viewports. Proves R-49, R-49a.

## Verification

Unit tests for pure rules (chart-type rules, quote normalisation, matching decisions). Integration tests on a real Postgres through Testcontainers for every rule that reads the database. Storybook stories and behavior tests first for every UI part. End-to-end tests at a phone and a desktop viewport for every screen, with axe and the anti-slop scan. Live model calls only in the evaluation script and the dry run.

## Deferred

- The rest of Section 6 (relation scopes, the full outbound HTTP service, notifications, `s3`). Trigger: Spec 6 epic `215x`.
- Core agent tools over people, groups and the audit log, and helper agents (`DEC-29`). Trigger: a customer asks the agent about core data. A handoff passes one task to one surface; parallel helper agents for parts of one question stay deferred (amended 2026-11-08).
- The agent analysis step: a calculation the agent writes over its query results, run in a sandbox, whose values a chart marks as calculated (`czjw.95`, deferred by the owner on 2026-11-08). The owner chose a sandbox service beside the app, with NVIDIA OpenShell as the candidate to evaluate. Trigger: an investigation of start time, memory, hosting rights under `DEC-33`, the data path through `scopesFor()` and scaling, then an ADR. Until then a projection chart cannot be drawn (dry run H8).
- Shared dashboards and decks. Trigger: a person asks to share one.
- Artifact kinds that a module declares, artifacts outside one chat (shared, listed on their own page), and adding a stored artifact to a dashboard or deck (`DEC-56` Revisit). A surface agent that adds a chart as a panel or a slide through its own write tool (R-46, amended 2026-11-08) is not this case. Trigger: a module needs a kind that the four core kinds cannot show, or a person asks to keep an artifact outside its chat.
- A vision-model critique of charts. Trigger: 20 to 30 hand-labelled charts exist.
- Encryption at rest of the typed key (`DEC-53` Revisit).
- A generic starter-dashboard seam. Trigger: a second module ships a starter.

## Assumptions

- Verified 2026-10-27: on OpenRouter, `anthropic/claude-opus-5.5` and `openai/gpt-6.1-terra` accept files, and `deepseek/deepseek-v4.1-flash-1017` accepts text and images only. `@openrouter/ai-sdk-provider` sends a PDF file part as OpenRouter `file` content.
- Verified 2026-10-27: `@openuidev/react-lang` 1.0.1 brings `lang-core`, `devtools` and `observability`, and no Radix or zustand. `lang-core` sends install telemetry from an install script unless it is disabled.
- Verified 2026-10-27, from Anthropic's pptx skill: pptxgenjs `addChart()` writes native editable charts.
- Assumed: the demo deployment can reach OpenRouter during the festival.
- Assumed: the demo account signs in through the usual identity provider.

## Open questions

- Real customer invoices through OpenRouter go to third-party model providers. Management must approve that before any real customer data goes through it. The demo data is fictional.
- The festival date in November 2026 is not fixed yet.

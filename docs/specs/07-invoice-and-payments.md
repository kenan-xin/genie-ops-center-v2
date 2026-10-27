# Section 7: Invoice and payments, with chat, dashboards and slides

Confidence: 7.4/10

Reasoning: the product behavior is settled one decision at a time with the owner, and two cold critiques tested the plan and the tickets against the code. The score is lower than earlier sections for three reasons. Four new parts must land in about five weeks with no slip order. The model calls depend on an outside service (OpenRouter) and on models that change. Several core seams are new (datasets, the chart gate, the agent runtime, the typed key store), and none of them exists in code yet.

Status: Approved by the owner, 2026-10-27. The owner approved the ticket breakdown on the same day.

## Goal and scope

Section 7 delivers an AI-assisted invoice and payment tracker, and the core seams and modules it needs, for a demo at a fintech festival in November 2026. A person uploads invoices and payment evidence in any order. A model reads each document, the person completes what is missing, and the system keeps reliable records with correct balances. The person then asks questions, builds dashboards and creates slide decks from those records by chat.

In scope:

- Core: module pages and a typed browser client (roadmap Section 6 items 1 and 2), the dataset seam (closes `OPEN-11`), the chart write gate, the model connection with a typed key store (the model part of Section 6 item 4, `DEC-53`), the module audit call, job retries and a job principal, the reporting-date setting, and the boss agent of `DEC-29` with the Ask page and the chat bubble.
- The Invoice and Payments module.
- The Analytics module and the Slides module, which serve any module's datasets.
- An evaluation suite that picks the models, and a demo deployment seeded from the demo pack.

Out of scope: foreign exchange, credit notes, refunds, write-offs, bank reconciliation, accrual accounting and tax rules. The rest of Section 6 (relation scopes, the full outbound HTTP service, notifications, the `s3` adapter) stays in Spec 6 epic `215x`. The Solutions module (Section 4) waits until this section is done.

Boundary with earlier sections. Sections 0 to 3 deliver the module contract, the tenant context, `can()` and `scopesFor()`, the audit log, the job worker, `FileStorage`, the shell and the design system. This section extends the module contract in core, documents each extension in `../architecture/module-contract.md`, and proves each one on the placeholder module.

## Sources

Planning artifacts, kept with the planning notes: the epic brief, the core flows, the technical plan and its two critiques, the ticket critique, and the chart research of 2026-10-27. The repository copy of the technical plan is `../tech-plans/07-invoice-and-payments.md`.

Module documents: `../modules/invoices-and-payments/README.md`, `../modules/analytics/README.md`, `../modules/slides/README.md`. Demo data: `../modules/invoices-and-payments/demo-pack/` (fictional).

Decisions: `../core/decision-log.md` `DEC-20`, `DEC-25`, `DEC-28`, `DEC-29` (amended 2026-10-27), `DEC-34`, `DEC-39`, `DEC-46`, `DEC-53`, `DEC-54`, `DEC-55`.

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

R-15. One core gate checks a chart before anyone saves or shows it: the config passes its schema, every query runs, every configured field is a returned column of a type that fits the chart, a line or area chart has an ordered x-axis, a donut has non-negative parts of one whole, no chart has a second y-axis, and no chart has more than 8 series. An empty result is valid and shows an empty state. A failure saves nothing and returns the missing keys and a fix hint.

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

R-26. The reading job retries twice with backoff and is idempotent per document. After the retries the document shows Could not read with Retry. A partial reading keeps its valid fields. With AI off, or a PDF with no text layer, the person fills the fields by hand.

R-27. The model classifies each document as an invoice, payment evidence, a paid receipt or a purchase order. The person can change the type in the review.

R-28. A missing due date blocks saving until the person enters a date or marks it unspecified. Missing payment terms stay blank. The system never fills either. A due date has a source: document, person or unspecified.

R-29. An invoice saves as unpaid and joins outstanding at once. An unspecified due date is never overdue.

R-30. A payment is created as a draft from its reading. It links automatically only when it names one invoice of the same customer, its amount is no more than that invoice's open balance, and the customer, invoice number and amount all passed the quote check. Every other case waits for the person: a split proposal, suggestions by customer and amount, or a choice for an overpayment.

R-31. A payment with no match is saved as Unallocated. It counts in collections and changes no invoice balance. When an invoice it names is saved later, R-30 applies.

R-32. Any link can be removed or changed from the invoice or the payment. A removed amount returns to the payment as Unallocated. An automatic link shows Undo. Every change writes an allocation event and an audit row. Correcting an invoice total below its allocations asks which link to reduce.

R-33. A different file with the same key facts shows Possible duplicate, and the person keeps or discards it. A paid receipt creates one invoice, one payment and one allocation. A purchase order changes no figure.

R-34. Linking locks the invoice row. A unique index holds the document hash. Allocations never exceed the invoice total or the payment amount.

R-35. The module publishes datasets `invoices`, `payments` and `customers` with the measures of R-36.

R-36. The measures, used by every part of this section and no others: invoiced sales are invoice totals by invoice date; collections are payments by payment date; outstanding is invoice totals minus allocated payments; overdue is outstanding with a known due date strictly before the reporting date; repeated late payment is a stated count of fully settled invoices with a known due date, paid after it.

R-37. The Documents inbox lists every document with its type, what was found and its status: Reading, Could not read, Needs your input, Linked automatically, Confirm the split, Possible duplicate, Duplicate (nothing added), No matching invoice, Kept as a reference, Saved.

R-38. Opening a document shows the full-page review of variant D: the document on the left, the fields on the right, each with its origin tag (Extracted, Entered by you, Corrected by you). Selecting a field highlights its source text on the document. On a phone, the document and fields stack.

R-39. The module declares `invoices:read` and `invoices:write` and default roles Finance (both) and Viewer (read).

### Boss agent (`DEC-29`)

R-40. The agent route handler lives in core and the app mounts it. Messages stream as AI SDK message parts.

R-41. Core stores agent sessions and messages, including tool results. Only the owner opens a session.

R-42. The Ask page lists the person's sessions and shows one. The chat bubble at the bottom right of every page starts a new session each time it opens. Both list the same sessions. Both link to the Documents inbox. Chat takes no file upload. A core permission gates Ask.

R-43. The agent's tools are `list-datasets` (names and descriptions first), `query-dataset` (fields of one dataset), `open-record` (R-11), and the tools that modules provide through the `agent-tools` interface. Core names no module tool.

R-44. An answer states the reporting date, uses only the measures of R-36, shows how each figure was calculated, and lists the records behind it as rows that open the record. A question the records cannot answer is refused.

R-45. Chat answers render through OpenUI `@openuidev/react-lang` with a catalog of our own components. Every chart and table takes a checked panel config, never typed values. Repair is local. The `lang-core` install script is denied in `allowBuilds`, and `OPENUI_TELEMETRY_DISABLED=1` is set. `@openuidev/react-ui` is never installed. The prose of an answer is styled by a shadcn Typeset preset, `typeset-chat`, that matches the design tokens, and the OpenUI components are marked `not-typeset`.

R-46. Tool results and document text are data, never instructions. A write tool runs only on an explicit request in the person's own message, and its change has Undo. The agent never creates, changes or links invoices and payments.

R-47. Every tool call writes an audit row with the tool, the dataset, the query and the row count, never the returned rows.

### Analytics module

R-48. A dashboard is saved per owner with a config of filters and panels (R-14). Only its owner opens it.

R-49. The person builds and changes a dashboard by chat beside it, or by hand: move, resize, rename, delete, chart type, filters. Dashboard filters for the date range and the customer apply to every panel. Every save passes the gate of R-15. Every chat change has Undo.

R-50. A panel refetches every 10 seconds and when the window regains focus.

R-51. The module declares `analytics:read` and `analytics:write` with default roles. The demo seed writes the Receivables overview starter dashboard.

### Slides module

R-52. A deck is typed elements on 16:9 slides: title, text, bullet list, figure, chart, table and image. It is saved per owner, and only its owner opens it.

R-53. Edits are patch operations guarded by the content hash, so an edit made on an older version is refused.

R-54. A deck freezes its figures when it is made and shows that date on each data slide. Only Refresh data changes them.

R-55. A deck uses the tenant branding. The person can present it full screen, and export it to PowerPoint with native editable charts through pptxgenjs, saved through `FileStorage`.

R-56. The agent writes one claim per slide, with a title that states the finding.

R-57. The module declares `slides:read` and `slides:write` with default roles.

### Evaluation and demo

R-58. An evaluation script, outside `pnpm gate:merge`, scores the candidate models on two tracks: extraction of the seven live uploads, and the nine read questions plus about 14 chart cases at reporting date 2026-10-27. Each case runs three times per model. A committed report gives pass rate, variance, cost and time, and the recommended defaults.

R-59. A demo tenant includes the three modules. A seed script loads the demo pack history and gives the demo account every Section 7 role.

R-60. Every new screen works at a phone and a desktop viewport (`DEC-25`).

## Acceptance criteria

AC-1. The placeholder module shows a page with a route parameter, calls its own procedure from the browser with types, and is refused without the route's permission, at both viewports. Proves R-1, R-2.

AC-2. Integration tests on the placeholder datasets prove grouped totals, range buckets, a two-series join with an empty gap, refusal without permission, an unknown field refused before SQL, the row cap, the time limit, a money aggregate refused across currencies, and a disabled module's dataset skipped. The standing tenant isolation test reads one dataset. Proves R-3 to R-8, R-13.

AC-3. Integration tests prove the reporting-date setting changes a dataset result, a placeholder audit action, a record route, a job that checks `can()` for its starter, and a retried job. Proves R-9 to R-12.

AC-4. Unit tests prove each chart-type rule with a failing and a passing config. Integration tests prove the query and column checks. The chart component's stories pass at both viewports in light and dark. Proves R-14 to R-16.

AC-5. An administrator stores a key that never appears in a response, log or audit row. A model call reaches only the allowed host and stops at its timeout. With no key, AI features show off. The gate runs with no network access. Proves R-17 to R-21.

AC-6. Integration tests on the demo pack history give every total in `expected_baseline_answers.json` and every answer in the module's expected-answers file at 2026-10-27, and cover each matching and correction rule. Proves R-22, R-29 to R-36, R-39.

AC-7. With the recorded test model, the seven live uploads reach the expected statuses and records, and the end-to-end review flow gives the results in `expected_live_running_totals.json`, at both viewports. Proves R-23 to R-28, R-37, R-38.

AC-8. With the recorded test model, the nine read questions match the expected-answers file, a person without `invoices:read` is refused, a disabled module's tools are absent, and the bubble and Ask share sessions, at both viewports. Proves R-40 to R-47.

AC-9. The starter dashboard shows the expected totals. A dashboard built by chat refreshes after a payment is saved, at both viewports. Proves R-48 to R-51.

AC-10. The five-slide monthly sales and collections deck is created by chat and presented, and its export parses as a valid file with native chart parts, at both viewports. Proves R-52 to R-57.

AC-11. The evaluation report and the recommended defaults are committed. Proves R-58.

AC-12. One end-to-end test runs the ten demo-script steps on a seeded demo deployment at both viewports. The owner signs off a live dry run, including opening the exported deck in PowerPoint. Proves R-59, R-60.

## Verification

Unit tests for pure rules (chart-type rules, quote normalisation, matching decisions). Integration tests on a real Postgres through Testcontainers for every rule that reads the database. Storybook stories and behavior tests first for every UI part. End-to-end tests at a phone and a desktop viewport for every screen, with axe and the anti-slop scan. Live model calls only in the evaluation script and the dry run.

## Deferred

- The rest of Section 6 (relation scopes, the full outbound HTTP service, notifications, `s3`). Trigger: Spec 6 epic `215x`.
- Core agent tools over people, groups and the audit log, and helper agents (`DEC-29`). Trigger: a customer asks the agent about core data.
- Shared dashboards and decks. Trigger: a person asks to share one.
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

# Module: Invoices and Payments

## Who it is for

A small finance team that issues invoices and receives payments, and a manager who asks questions about them.

## Problem

Invoices and payments arrive as loose documents in any order: partial, combined, duplicate or unreferenced payments, and invoices with no due date. The team needs records that are complete and correct enough for questions, dashboards and reports to trust.

## What it does

A person uploads documents to the Documents inbox. A model reads each one and classifies it. The person completes what is missing and saves an invoice as unpaid. Payments link to invoices automatically when the match is clear, and by the person's choice otherwise. Balances are always the invoice total minus its allocations. The module publishes datasets that the boss agent, Analytics and Slides read. Full requirements: `../../specs/07-invoice-and-payments.md`, R-22 to R-39.

## Permissions and roles

Three keys: `invoices:read` reads invoices, payments and customers, `invoices:write` saves invoices and payments and changes their links, and `invoices:use` opens the Invoices and Payments workspace (`DEC-50`). Three default roles: Finance (use, read and write), Viewer (use and read), and Invoices and Payments user (use). The roles carry `invoices:use` now because a seeded role is never rewritten. S7-07 adds the workspace entries and pages.

## Tables

Amounts are integer cents beside a three-letter upper-case currency code. A balance is the invoice total minus its allocations and is never stored.

- `customer`: a name and an optional email. Two names that differ only in case and outer spaces are refused.
- `document`: one uploaded file, by the core file id, with its SHA-256 hash, its uploaded file name, its kind (invoice, payment, paid receipt or purchase order; null until the reading job classifies it), its reading status (`reading`, `could-not-read` or `read`), the number of reading attempts, the reading outcome when the reading decided that the person must act (`confirm-split`, `no-match`, `possible-duplicate`, `ai-off` or `no-text-layer`), and the checked reading. A unique hash stores an exact copy once. A document stored before uploads existed has no file name and is `read`.
- `invoice`: a customer, an optional document, the number, the invoice date, an optional due date with its source (document, person or unspecified; unspecified has no date), the payment terms, the currency, a positive total and a description.
- `payment`: a customer, an optional document, the payment date, the currency, a positive amount, the reference, the method and the invoice numbers it names.
- `allocation`: a positive amount of one payment linked to one invoice, at most once per pair, marked when the link was automatic.
- `allocation_event`: an append-only history of each link, change and unlink, with the amounts before and after and the person who made it.
- `field_origin`: for one field of a document, whether it was extracted, entered or corrected. An extracted field always holds its quote and page.

## Record types

- `invoices-customer`: a customer, labelled by name, with no parent and no path.
- `invoices-invoice`: an invoice, labelled by number, under its customer, at `/m/invoices/invoices/<id>`.
- `invoices-payment`: a payment, labelled by reference or date, under its customer, at `/m/invoices/payments/<id>`.

A grant on a customer covers its invoices and payments.

## Links

A link (an allocation) puts an amount of one payment against one invoice. Every write locks rows in one order: the customer row, then invoice rows in id order, then payment rows in id order, then allocation rows. A write can skip a level. One write reverses two levels: an invoice total correction locks the links of its invoice before their payments. This is safe because every write that touches a link locks the link's invoice first. With these rules, two writes cannot deadlock. Under those locks, a link is refused when it would make the invoice's allocations exceed its total, or the payment's allocations exceed its amount.

A payment links only to an invoice of the same customer and the same currency. A pair links at most once. A second link of the same pair is refused with `link-exists`. Change the existing link instead. A removed link returns its amount to the payment as unallocated. Every link, change and removal writes an `allocation_event` row, with the amounts before and after and the person who made it, and an audit row on the invoice. `automatic` marks a link the module made by itself, which Undo can remove. A changed link is a person's link, so it loses the mark.

## Uploading documents

`uploadDocument` at `POST /invoices/documents` takes one PDF per call. A file whose first bytes are not `%PDF-` is refused with `document-not-pdf`; the declared type is not read, because a browser can send none. A file over the deployment's `FILE_MAX_BYTES` is refused with `document-too-large` (HTTP 413). A document has no customer before a save, so the upload needs `invoices:write` on the whole deployment; a writer scoped to one customer is refused.

The file goes through `FileStorage`, and the document stores its SHA-256 hash and its file name, with no kind and the status `reading`. An exact copy of a stored document stores nothing and answers `duplicate` with the stored document and its label: Duplicate (nothing added). Nothing is kept for the copy, so the answer is gone after a reload. When two uploads of the same new file meet, one stores it and the other removes its copy in the same transaction and answers `duplicate`. The label of a document is its file name, else the number of the invoice or the reference of the payment saved from it, else "Document".

## Reading job

Each stored upload enqueues one `invoices.read-document` job after its transaction commits. The job runs as the uploader, never as a system principal, so a revoked `invoices:write` is seen at read time; a job without a starter changes nothing. It fails up to three times: the first run and two retries with backoff (`{ limit: 2, delaySeconds: 15, backoff: true }`). The worker passes no attempt number, so the job counts its own attempts in `reading_attempts`; a failed run before the third rethrows for pg-boss to retry, and the third failed run sets the document to Could not read (`could-not-read`) and completes. Every write of the job names `reading_status = 'reading'`, so a late or second run for a document that is already read changes nothing.

A run reads in this order. With AI off, it ends at once with the outcome `ai-off`, before any byte is fetched; a `modelFor` refusal with `ai-off`, when AI is turned off between the check and the call, ends the same way. Otherwise it extracts the PDF text layer page by page, and a PDF with no text layer ends with the outcome `no-text-layer`. These are the two manual-entry reasons: the document is read with no kind and no reading, and the person fills its fields. The upload always enqueues; only the job decides them.

A document with text goes to the document-reading model that `modelFor` builds, through `generateText` with a structured-output schema and `maxRetries: 0`, so the SDK and the job do not both retry. The system message marks the text as data, and the model has no tool. The user message holds the text with a `--- page <n> ---` marker before each page. Only the document models the module lists as file readers, `anthropic/claude-opus-5.5` and `openai/gpt-6.1-terra`, also get the PDF as a file part, without its file name. The model answers the kind (invoice, payment, paid receipt or purchase order) and, for each field, its value, its quote and its page, or nulls when the document does not state it.

The quote check keeps a value only when its quote stands on the page it names, after whitespace, line breaks and thousands separators are normalised, and the value stands in its own quote: an amount as an equal cents token, an identifier or a date as a whole token, any other value as a substring. A date passes only as `YYYY-MM-DD` in its quote. A value that fails goes to `dropped` ("check this"), and the other fields stay, so a partial reading keeps its valid fields. One transaction stores the kind and the checked reading where none is stored yet, and one `extracted` field origin per kept field, plus one `invoiceNumbers` origin with the first number's quote and page. A run that finds the reading already stored asks the model nothing again.

When the enqueue itself fails, the document becomes Could not read and the upload still answers `uploaded`.

`retryReading` at `POST /invoices/documents/{id}/retry` starts a Could not read document again with 0 attempts, as the person who retried. It needs `invoices:write` on the whole deployment, like the upload. A document in another state is refused with `document-not-retryable` (HTTP 409), so a second Retry while it reads enqueues nothing.

## Documents inbox

`listDocuments` at `GET /invoices/documents` answers every document, newest first, at most 1,000 rows with `truncated` set past them. Each row has its label, its kind (null until read), its status, the manual-entry reason (`ai-off` or `no-text-layer`) and what was found: the checked customer, currency, amount in cents and invoice numbers of its stored reading, or null before one. The view also answers whether AI is on and whether the person may upload.

The status is decided in this order: Reading and Could not read from the job; a purchase order is Kept as a reference; a payment with an automatic link is Linked automatically; any other invoice or payment saved from the document is Saved, also when its reading had asked for a split; then the stored match outcome, Confirm the split, No matching invoice or Possible duplicate; else Needs your input. Invoices and paid receipts are saved by the person, so their readings need input. Duplicate (nothing added) is an upload answer only, never a row.

A document has no customer before a save, so the list needs `invoices:read` on the whole deployment; a reader scoped to one customer is refused. Upload and Retry need `invoices:write` on the whole deployment, and the view's `canUpload` says whether the person has it. The label is the file name, else the number of the invoice or the reference of the payment saved from it, else "Document", so a document stored before uploads kept a name shows its saved record.

The module provides the `document-inbox` capability: Documents at `/m/invoices/documents`, for a holder of `invoices:write`, the key of the place where the module takes documents. Ask and the chat bubble link to it.

## Saving invoices

An invoice saves as unpaid and joins outstanding at once. Its customer is either an existing one, chosen by id, or a new one that the person confirmed. A new customer needs a write grant on the whole deployment. A grant on one customer saves only that customer's invoices. Customer names are unique when case and outer spaces are ignored, so a confirmed name that already exists reuses that customer, and only a new one writes a `customer-created` audit row.

The key facts of a Possible duplicate invoice are the same customer and the same number, ignoring case and outer spaces. The save then answers `possible-duplicate` with the existing invoice and writes nothing. The person can send the save again with `keepPossibleDuplicate`, because no unique index holds the number. A document gives at most one invoice: a second save from it is refused with `document-already-saved`. An invoice save takes only an `invoice` document. A purchase order or a payment document is refused with `document-kind-mismatch`, so a purchase order never counts as a sale.

When the invoice is saved, R-31 runs in the same transaction. It takes each payment of that customer, in that currency, with no link, that names this invoice number and no other, and whose facts passed the quote check, oldest payment date first. Each one links automatically under R-30 when its amount fits the open amount that remains. A link made this way is marked automatic, so Undo applies, and it writes its allocation event and audit row. Every other payment stays unallocated for the person.

The seam for S7-08 and S7-09 is `MATCH_FACT_FIELDS`: the `field_origin` rows `customer`, `invoiceNumbers` and `amount` of the payment's document. Their facts passed the quote check when all three hold origin `extracted`. The reading job writes `extracted` only for a value that passed the quote check, and a person's change marks the field `corrected`, so a corrected payment never links by itself.

## Saving payments

The key facts of a Possible duplicate payment are the same customer, the same payment date, the same amount and the same currency. A payment of a customer that already existed with those facts answers `possible-duplicate` with the existing payment and writes nothing, until the person sends the save again with `keepPossibleDuplicate`. A document gives at most one payment, and a payment save takes only a `payment` document. The named invoice numbers are stored trimmed, in upper case, without repeats and sorted.

A payment saves in one of two ways.

- By hand, through `savePayment` at `POST /invoices/payments`. The person chooses the customer and the links. The save never links by itself. It checks a write grant on the customer and on each chosen invoice, and saves the payment and every link in one transaction, so a refused link, for example one above an invoice's open balance, saves nothing. A second save from the same document is refused with `document-already-saved`, before the duplicate check.
- From a reading, through `recordPaymentFromReading`, which the S7-08 reading job calls on the server. It is not a procedure. It finds the customer by name, ignoring case and outer spaces, and never creates one. It links automatically only under R-30: the payment names one invoice of that customer in its currency, the amount is no more than that invoice's open balance, and the document's `MATCH_FACT_FIELDS` all hold origin `extracted`. Every other case writes nothing and answers the match for the person.

For S7-08, each answer of `recordPaymentFromReading`, the `reading_outcome` the reading job stores for it, and the inbox status it leads to. The job calls it as the uploader with the reading as stored, also on a resumed run. A null outcome lets the records decide the status.

| Answer | Stored outcome | Inbox status |
| --- | --- | --- |
| `saved` (an automatic link) | null | Linked automatically |
| `needs-review` with match `split` | `confirm-split` | Confirm the split |
| `needs-review` with match `no-match`, also when no customer has the name (`customerId` is null) | `no-match` | No matching invoice |
| `possible-duplicate` | `possible-duplicate` | Possible duplicate |
| `needs-review` with match `confirm`, `overpayment` or `suggestions` | null | Needs your input |
| `already-saved` | null | The document's payment is saved already; the job shows that payment |
| refused with `forbidden` (the uploader lost `invoices:write`), `invoices:document-already-saved` (a hand save won the race) or `invoices:document-kind-mismatch` (a person changed the type) | null | Needs your input, or the records of a hand save |

A reading without a checked customer, date, currency or amount sends nothing and stores no outcome. Any other error fails the attempt, so the job retries it.

## Receipts, purchase orders and corrections

A paid receipt is one invoice, one payment and one allocation. `savePaidReceipt` at `POST /invoices/receipts` saves, in one transaction, the invoice, a payment of its full total on the same date that names its number, and a link of that total, and writes a `receipt-saved` audit row. It takes only a `paid-receipt` document, gives at most one record per document, and asks Possible duplicate on the invoice's key facts like an invoice save.

No save takes a purchase-order document, so a purchase order changes no figure.

`correctInvoiceTotal` at `PATCH /invoices/invoices/{id}` changes an invoice total. A total at or above its allocations is saved with an `invoice-total-corrected` audit row. A total corrected below its allocations answers `choose-links` with the excess and the invoice's links, and writes nothing. The person sends it again with `reductions`, each the new, lower amount of one link of this invoice, where 0 removes the link. The reductions are applied as link changes, each with its allocation event and audit row, before the total changes. A reduction that names another invoice's link or does not lower its link is refused with `reduction-invalid`, and reductions that still leave the links above the new total are refused with `reductions-insufficient`, so nothing changes.

## Datasets

Four datasets, each under `invoices:read` and filtered by `scopesFor()`. A grant on a customer covers its invoices, payments and links. Every dataset reads as of the reporting date (R-9): it leaves out an invoice or a payment dated after it, and counts an allocation only when its payment is dated on or before it. The measures are those of R-36.

| Dataset | Rows | Time field | Record key |
| --- | --- | --- | --- |
| `invoices.invoices` | Invoices dated on or before the reporting date, with total (invoiced sales), allocated, outstanding, overdue, days overdue, settled on and paid late | `invoiceDate` | the invoice |
| `invoices.payments` | Payments dated on or before the reporting date, with amount (collections), allocated and unallocated | `paymentDate` | the payment |
| `invoices.customers` | Every customer, with the first invoice date and the late-payment counts | `firstInvoiceDate` | the customer |
| `invoices.allocations` | One row per link whose payment and invoice are both dated on or before the reporting date, under the scope of the invoice | `paymentDate` | the invoice |

Overdue is a positive outstanding with a known due date strictly before the reporting date, so due on the day is not overdue and an unspecified due date never is. Paid late holds only for a fully settled invoice with a known due date, so a part-paid invoice is not in the late-payment rate.

The specification names three datasets. The fourth, `invoices.allocations`, is the only way the generic query shape can show each link. `invoices.customers` holds no money, because a customer can be invoiced in more than one currency and a figure per customer would mix them; its late-payment counts carry R-36 per customer.

## Agent rules

The module gives the agent no tool. Through the `instructions` of its `agent-tools` capability, it gives five rules under `invoices:read`: the agent never creates, changes or links an invoice or a payment (R-46); it uses only the R-36 measures; it uses the two definitions under "Expected answers"; it states the reporting date and how each figure was calculated (R-44); and it lists the records in a table that opens each record. A person without `invoices:read` gets none of these rules. The text is in `src/agent-instructions.ts`, and the recorded answers hold it verbatim.

## Pages

The workspace entries Invoices opens the list at `/m/invoices/invoices` and Payments opens `/m/invoices/payments`, and Documents opens the inbox at `/m/invoices/documents`. Every page requires `invoices:use`, and every loader reads under `invoices:read`, so a person with only the Invoices and Payments user role gets the denied page (P5). The Documents inbox needs a tenant-wide `invoices:read`, because a document has no customer before a save (S7-08 decision 12). Every page reads through the datasets above as of the reporting date (R-9), so no page adds a balance of its own and the pages and the agent agree (P3).

| Page | Path | Reads |
| --- | --- | --- |
| Documents inbox | `/m/invoices/documents` | `document` rows newest first with their file-name label, kind, status and what was found, at most 1,000 rows (R-37, S7-08 decisions 11 to 13), and the AI state and whether the person may upload. Upload and Retry need a tenant-wide `invoices:write` |
| Invoices list | `/m/invoices/invoices` | `invoices.invoices`, ordered by invoice date and number, at most 1,000 rows; a cut read says how many it shows (P4; paging is deferred to `czjw.28`) |
| Invoice record | `/m/invoices/invoices/<id>` | `invoices.invoices` and `invoices.allocations` filtered by the invoice, its link history from `allocation_event` oldest first (the time in the tenant's time zone, the change, the payment, the amount before and after, Automatic or By a person; no actor name, P10), and a 5-minute link to its source PDF under `invoices:read` on the invoice (P11). The page declares `invoices:read` as its record's read key, so core refuses a person without it before the title or the trail shows the invoice number (R-1a). An invoice dated after the reporting date shows a note with its number, not 404 (P7) |
| Payments list | `/m/invoices/payments` | `invoices.payments`, ordered by payment date and reference, at most 1,000 rows; a cut read says how many it shows (P4; paging is deferred to `czjw.28`). The status is Allocated, Part allocated or Unallocated from the unallocated amount (R-31) |
| Payment record | `/m/invoices/payments/<id>` | `invoices.payments` and `invoices.allocations` filtered by the payment, its link history from `allocation_event` oldest first (the time in the tenant's time zone, the change, the invoice, the amount before and after, Automatic or By a person; no actor name, P10), and a 5-minute link to its source PDF under `invoices:read` on the payment (P11). The page declares `invoices:read` as its record's read key, so core refuses a person without it before the title or the trail shows the payment (R-1a). A payment dated after the reporting date shows a note with its label, not 404 (P7) |

## Demo pack

`demo-pack/` holds the fictional demo data: 6 customers, 36 invoices, 30 payments, the history PDFs, seven live-upload PDFs and the expected answers at reporting date 2026-10-27. The SQL and SQLite copies of the same history are left out, so `SHA256SUMS.txt` lists two files that are not here. `04_Demo_Guide/live_expected_entities_DO_NOT_PRELOAD.json` is test data only: no seed reads it.

## Demo seed

`apps/genie/testing/seed-demo.ts` (target `@genie/app:seed-demo`) loads the demo pack history and the demo account's access into one deployment (R-59). It reads the module list from `customers/genie-demo/deploy/modules.txt`.

Command, from `apps/genie`: `DEMO_ACCOUNT_EMAIL='<demo account address>' node --env-file=<env file> testing/seed-demo.ts [--dry-run]`. It reads `DATABASE_URL` and `DEMO_ACCOUNT_EMAIL` from the environment only and loads no env file itself, so the operator names the file. It prints the target as host, port and database, never the user, the password or the demo account's address. A missing variable or an unknown flag prints the usage and exits 2.

Write list, one numbered line each in its output, with the count to write and the count already present:

1. Role assignments: every role of the listed modules, granted tenant-wide and directly to the demo account (`role_assignment`).
2. Reporting date: the pack's `metadata.as_of_date`, 2026-10-27 (`tenant_settings.reporting_date`).
3. History PDFs through `FileStorage` (`file`, `file_blob` and `document` rows).
4. Demo pack history through the module procedures as the demo account (`customer`, `invoice`, `payment`, `allocation`, `allocation_event` and `audit_event` rows).

The access writes go straight to the tables, so they add no audit row, notification or email (P13). If the history step fails, the role grants and the reporting date stay written, and a rerun finishes the job. Each PDF's SHA-256 keys its record, so a second run writes nothing and ends `Already seeded: nothing to write.`, and a stopped run resumes. `--dry-run` prints the same lines and writes nothing.

It refuses, writes nothing, prints `Refused: <reason>` and exits 1 when the module tables do not exist (start the app on the database once), when the module is switched off, when the module has no roles (switch it on in Admin > Modules, which creates them), or when no person has the address (the demo account signs in once).

Revert: take `pg_dump -Fc` before the run, and restore it with `pg_restore --clean --if-exists --single-transaction` with the app stopped. A restore also reverts every other change made after the dump. There is no revert mode, because a revert deletes append-only allocation events and audit rows (P15).

## Expected answers

`expected-answers.json`, beside the demo pack, holds the nine answers to the pack's read prompts at reporting date 2026-10-27, in integer cents: `overdue-invoices`, `repeated-late-payers`, `overdue-balances`, `monthly-invoiced-and-collected`, `top-customers-by-sales`, `top-customers-overdue`, `invoices-without-due-date`, `manual-due-dates` and `partial-payments`. Each holds its prompt, the R-36 measures it uses, its rows and, where one is meaningful, a total. Two answers rest on a definition. A customer repeatedly pays late when it paid late on more than half of its settled invoices with a known due date. Top customers are the three largest by invoiced sales. The values come from the pack's own expected files and its history records, never from this module's code, and `testing/demo-history.integration.test.ts` proves the datasets answer every one of them. The app test `apps/genie/testing/invoice-answers.integration.test.ts` asks the nine questions through the agent with hand-written recordings in `apps/genie/testing/model-recordings/`, and checks each answer's charts against this file. The owner records them live through that test file. S7-14 runs them as the answer track of the evaluation suite; both read this file.

## Open decisions

| Id | Question | Default if not decided |
| --- | --- | --- |
| OPEN-I1 | May real customer invoices go to OpenRouter? | No. Only the fictional demo data, until Management approves. |

## Not built

Foreign exchange, credit notes, refunds, write-offs, bank reconciliation, accrual accounting and tax rules.

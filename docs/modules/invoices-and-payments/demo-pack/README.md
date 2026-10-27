# Invoice & Payment Demo Pack

All records are fictional. Snapshot date: **27 October 2026**, Asia/Singapore. Currency: SGD. Seller: Northstar Studio (fictional). Use this fixed date for repeatable overdue answers; real current dates will change ageing.

## What is included
- 6 customers; 36 historical invoices; 30 payment records; 30 payment allocations.
- Matching PDF documents for every historical invoice and payment.
- Seven live-upload PDFs covering missing due date, partial payment, combined payment, duplicate, unmatched payment, paid receipt and purchase-order proof.
- CSV, JSON, SQL and SQLite versions of the same baseline history. Choose ONE import route.
- Expected totals, invoice statuses, customer behaviour and demo scenarios.

## Setup
1. Preload `01_History_Datasets/history_seed.json` OR import the four CSV files in this order: customers, invoices, payments, payment_allocations. SQL and SQLite are alternate import formats, not additional data.
2. Attach PDFs from `02_History_PDFs` to their `source_pdf` records if your agent supports source links. DO NOT ingest these PDFs again as new transactions after seeding.
3. Keep `03_Live_Upload_Documents` out of the initial import. Upload these during the live demo, in numbered order.
4. Files in `04_Demo_Guide` are developer/presenter reference outputs, not records to import.
5. This ZIP does not modify the previous browser mockup. Connect it to your own platform/importer. The previous mockup uses a different small seed.

## Baseline answers
- Total invoiced: SGD 236,400.00.
- Recorded collections: SGD 195,200.00.
- Outstanding invoice balances: SGD 41,200.00.
- Overdue unpaid balances: SGD 27,350.00.
- Outstanding with unspecified due date: SGD 4,350.00. Exclude this from overdue totals.
- October invoiced sales: SGD 43,900.00.
- October payments collected: SGD 18,150.00.

## Useful chatbot prompts
- Which customers currently have overdue invoices? Show the unpaid amount, due date and days overdue, with sources.
- Which customers repeatedly pay late? Use fully settled invoices with known due dates; show the numerator and denominator. Show unpaid overdue balances separately.
- What did we invoice and collect each month from May to October? Explain why those numbers differ.
- Who are our top customers by invoiced sales? Which also have the highest overdue balances?
- Which invoices have no due date? Which due dates were entered manually?
- Find invoices with partial payments and show each allocation.
- Create a dashboard with invoiced sales, collections, outstanding balances and overdue ageing.
- Create five slides: monthly sales, collections, overdue customers, payment behaviour and collection priorities.

## Live upload walkthrough

### 01_Invoice_Missing_Due_Date.pdf
Extract invoice INV-LIVE-001 for ABC Trading, SGD 5,000, dated 2026-10-26. Due date and payment terms must remain blank. Ask user to enter 2026-11-25 for the walkthrough. Save as unpaid/open, not overdue.

### 02_Payment_Partial_Existing_Invoice.pdf
Match Harbor Foods payment of SGD 3,000 to INV-2026-09-03. Previous payment is SGD 2,000. Invoice total SGD 7,200; remaining SGD 2,200.

### 03_Payment_Covers_Two_Invoices.pdf
One SGD 8,250 Orchid Retail payment covers INV-2026-08-04 (4,050) and INV-2026-09-04 (4,200). Confirm allocations. Both settle late. Do not create two payments of 8,250.

### 04_Duplicate_of_Partial_Payment.pdf
Byte-for-byte duplicate of document 02. Do not create a second payment or reduce the balance again.

### 05_Payment_Unmatched.pdf
Meridian Labs SGD 2,222 payment; no invoice reference, and no exact amount match. Keep unallocated. Recorded collections increase after user confirms evidence, but invoice outstanding balances do not change until allocated.

### 06_Paid_Sales_Receipt.pdf
Lumi Design paid sales receipt for SGD 1,800. Create one standalone sale and one corresponding payment if your model supports receipts. If invoices-only, represent it as one paid sales record with a shared receipt reference; never count the sale twice.

### 07_Purchase_Order_Not_Proof_of_Payment.pdf
Supporting order document only. Does not establish an invoice or completed payment. No financial KPI changes.

## Data dictionary and calculation rules
- `invoice_id`, `customer_id`, `payment_id`: stable IDs. Join on IDs, not company spelling.
- `document_due_date`: what the original PDF states; null means absent.
- `due_date`: effective operational due date. Null means unspecified. `due_date_source` is document, user or unspecified. INV-2026-09-04 has a user-entered due date of 2026-09-30 that is intentionally absent from its source PDF.
- `payment_terms`: null when missing; do not invent a standard term.
- `total_amount` = subtotal + tax_amount. All synthetic tax amounts are zero; this is a demo simplification, not tax guidance.
- `payment_allocations` joins payments to invoices and holds allocated_amount. A payment can cover several invoices; an invoice can receive several payments.
- Invoice balance = total_amount minus allocations. Do not join payments and invoices then sum duplicated payment totals.
- Overdue = positive invoice balance AND known due_date strictly before 2026-10-27. Due today is not overdue. Unknown due dates remain in outstanding but not overdue.
- Fully settled late = final settlement date > effective due date. Part-paid unpaid invoices are not included in the settled-late rate denominator.
- Invoiced sales = invoice totals grouped by invoice date. Collections = recorded payments grouped by payment date. Neither is automatically recognised accounting revenue; this pack does not implement accrual accounting.
- Paid receipt scenario: represent one sale and one payment. A generic order confirmation is not proof of payment and does not create invoiced sales by itself.
- Unallocated payment: recorded collections can rise without reducing any invoice balance. Track unallocated money separately.
- Seed is a small clean single-currency example. No FX, credit notes, refunds, write-offs or bank reconciliation are modelled.
- CSV blanks map to null. JSON nulls are canonical. Currency amounts are numeric dollars with up to two decimals; use decimal or integer cents in production.

## Suggested five-slide story
1. Monthly invoiced sales are growing.
2. Collections do not always follow the same timing.
3. ABC Trading and Harbor Foods show late-payment patterns; Orchid Retail has old unpaid invoices.
4. Missing due dates prevent reliable overdue classification.
5. Document matching reduces manual tracking and keeps balances current.

## Validation
The included validation_report.json checks source-document references, date ordering, balances, allocation totals, referential integrity, duplicate hashes, one-page PDFs and extracted text identifiers. Expected result files are calculated from the exact baseline seed. No external evidence or real customer data was used.

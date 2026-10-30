# src/services/reading

The reading of a document by the model (Spec 7 R-24 to R-27).

## What belongs here

The shape of a stored reading after the quote check, and the steps of the reading job that turn
a document's bytes into that shape: the text layer, the model call and the quote check.

`text-layer.ts` holds the text layer. `extractTextLayer` calls unpdf 2.0.0's `extractText` with
`mergePages: false` on a copy of the caller's bytes, because PDF.js can detach the buffer it
gets and the reading job sends the same bytes as the file part. `markedText` puts
`--- page <n> ---` directly before each page, which the quote check uses to place a quote on
its page.

The quote check in `quote-check.ts` is the only place that decides which values of a reading
count as `extracted`. `checkReading` keeps a value only when its quote is on the page it names
and the value stands in its quote. The page check uses `normalizeForQuote`, which removes
thousands separators and all whitespace. Inside the quote, whitespace collapses to one space
instead: an amount needs one number token with equal cents, an invoice number or a date must be
a whole token (no letter or digit next to it), and any other value is a normalised substring.
Its formats are the save inputs' formats, so a kept value always fits a save.
`model-output.ts` holds the structured-output schema the model answers with; it carries no
formats, so one badly formed value is dropped here instead of failing the whole answer.

## What must not go here

A match, a link or a balance: the model never computes one, and the saves in
`services/ledger/` do. A save of a record, a permission check that is not `can()` or
`scopesFor()`, and a live model call in a test.

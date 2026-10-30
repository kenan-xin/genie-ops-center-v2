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

## What must not go here

A match, a link or a balance: the model never computes one, and the saves in
`services/ledger/` do. A save of a record, a permission check that is not `can()` or
`scopesFor()`, and a live model call in a test.

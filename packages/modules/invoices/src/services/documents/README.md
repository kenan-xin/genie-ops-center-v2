# src/services/documents

The uploaded documents of the module (Spec 7 R-23).

## What belongs here

The upload: the access check, the PDF and size checks, the store through `FileStorage` and the
one `document` row per exact file, all in one transaction. How a document is named in a list or
an answer, written once as SQL so every read shows the same label.

## What must not go here

A model call, the reading job, a save of an invoice or a payment, and any read of a core table.
Bytes go only through `FileStorage`, never into a module table.

# src/services/export

The PowerPoint export of a deck (R-55).

## What belongs here

The pure conversion of the chart gate's data to native PowerPoint chart series, the builder that
writes a deck with pptxgenjs from the shared slide layout, and the export procedure's work: read
the caller's own deck as the caller may see it, build the bytes, and hand them to the store, which
saves them through `FileStorage`. It runs only in the app process (`DEC-55`).

## What must not go here

A browser import: nothing under `src/presentation/` imports this folder or `pptxgenjs`. A direct
write of the `deck` table or of file bytes (the store and `FileStorage` own those), a call to
`writeFile` or any file system write, and a chart drawn as a picture.

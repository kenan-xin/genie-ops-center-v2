# Module: Slides

## Who it is for

Anyone who presents figures from the data that modules publish.

## What it does

A person creates a deck by chat, or edits it by hand. A deck is typed elements on 16:9 slides, never HTML. Edits are patch operations guarded by a content hash. A deck freezes its figures when it is made, shows that date, and changes them only on Refresh data. It uses the tenant branding, can be presented full screen, and exports to PowerPoint with native editable charts through pptxgenjs (`DEC-55`). Decks are owner-only. Full requirements: `../../specs/07-invoice-and-payments.md`, R-52 to R-57.

## Permissions and roles

`slides:read` and `slides:write`, with default roles named in the module's declaration.

## Tables

`deck`: owner, title, zod-checked content, the freeze time and a content hash.

## Not built

Shared decks, Word documents, freely positioned objects.

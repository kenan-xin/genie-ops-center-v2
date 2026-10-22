# packages/ui/src/fonts

The self-hosted faces of Spec 3 R-10 and R-11.

## What belongs here

The woff2 files of the approved faces and of the fixed mono face, their licenses, and
`fonts.css`, which `@genie/ui/fonts.css` serves. `PROVENANCE.md` records where each
file came from.

## What must not go here

A face outside `approvedFonts` in `src/theme/tokens.ts` other than the fixed mono face,
a subset other than latin and latin-ext, or a URL to a third-party font service. A new
face arrives in one pull request with its files and its `approvedFonts` key.

Record, not current. This file is history of one design round. It states positions that later decisions replaced. Read `../../core/decision-log.md` for what stands.

# Prompt: update genie-ops-center-v2/docs after the design round-two review

Copy everything below the line into the docs agent.

---

You work in `/home/kenan/work/genie-ops-center-v2`. You edit documents only. Write no application code.

A design review compared this tree against the design tree at `/home/kenan/work/genie-ops-center-design`. The design made five decisions that this tree does not carry. Your job is to carry four of them, raise one as an open question, and change nothing else.

## Read first

1. `CLAUDE.md` in this repository. It holds the writing rules, the architecture invariants, and the rule that a module contract is extended in core, in the same change.
2. `docs/README.md`. It maps the folders and repeats the writing rules.
3. `docs/core/decision-log.md`. Read two recent entries, for example `DEC-44` and `DEC-45`, to copy the entry format before you write a new one.
4. `/home/kenan/work/genie-ops-center-design/findings.md`, item R1 and item R5. That is the evidence for this work.
5. `/home/kenan/work/genie-ops-center-design/product/fix-report-2026-09-17.md`, the sections "Decided on 2026-09-17". That is where the design's wording comes from.

## House rules for this tree

- Never name a customer.
- Never reference a previous codebase.
- A core document describes the platform only. Module content goes in `docs/modules/<module>/`.
- A platform-level unsettled point is `OPEN-n` in `docs/core/vision.md`.
- A new decision is a `## DEC-n` entry in `docs/core/decision-log.md` plus one row in the Decided table in `docs/core/vision.md`.
- The next free decision id is `DEC-47`. The log ends at `DEC-46`.
- This project tracks work with `bd`. Run `bd prime` first. Do not write a markdown task list.
- Do not commit and do not push. Report the changed files at the end.

## Change 1: one tenant brand color, plus two typography fields

The design dropped the secondary and accent colors and added a font size preset and a text color.

Evidence in the design tree: `product/sections/branding/types.ts` declares `primaryColor`, `fontSize`, and `textColor`, and no secondary or accent field. `product/sections/branding/data.json` matches.

Edit these four places.

1. `docs/architecture/data-shape.md`, the `tenant_branding` section, the Colors bullet. It reads "primary_color, secondary_color, accent_color, primary_foreground, secondary_foreground, accent_foreground (the three foregrounds are computed and stored)". Replace it with `primary_color` and `primary_foreground` only, the computed-and-stored note kept for the one foreground. Add `font_size` (`compact`, `default`, `large`, default `default`; the root font size in the browser, 14, 15, or 16 px) and `text_color` (heading and body color on light surfaces; the dark theme keeps its fixed value). Keep `default_theme` and `font_family` as they are.
2. `docs/core/vision.md`, the Branding feature list. The Colors line reads "Colors: primary, secondary, accent, with foreground colors computed". Rewrite it for one color. The Typography line reads "Typography: font family chosen from an approved list. No font upload." Add the size preset and the text color to it.
3. `docs/core/roadmap.md`, Section 3, item 2. It reads "Tenant token layer: primary, secondary, derived foregrounds, logo, favicon, company name". Remove secondary and the plural foregrounds. Add the size preset and the text color.
4. `docs/core/roadmap.md`, Section 3, item 5. The Colors and theme tab reads "(primary, secondary, accent, default theme, font from the approved list, contrast check)". Rewrite it, and add the Typography tab that the design now has between Colors and Sign-in page.

Write one new decision, `DEC-47`, in `docs/core/decision-log.md`, in the format the other entries use. The question is why a tenant sets one color and not three. The answer from the design: no surface uses a secondary color, and an accent with no named surface cannot be contrast-checked. The reopen path is that a secondary color returns only with a named surface and its own contrast pair. Add the `DEC-47` row to the Decided table in `docs/core/vision.md`.

## Change 2: the record-type resolver returns a path

The audit reader links a target when the target still exists. Core cannot build that link today.

Evidence: `product/sections/audit-and-tenant-settings/spec.md` in the design tree.

Edit `docs/architecture/module-contract.md`, the table "What a module declares", the Record types row. It reads "Types a scope can point at, with a resolver from id to label". Replace the shape with: a resolver from id to `{ label, path? }`. Core renders a link only when `path` is present, and `path` must be a route the caller may open under `can()`. Add the audit reader to the "Core uses it for" column, beside the scope picker and the Access overview.

## Change 3: a module can declare a navigation tree

The shell shows a pinned rail of favorite solutions and a collapsible category tree that lists only the records the person is granted. The contract has one navigation point and it is flat.

Evidence: `product/shell/spec.md` in the design tree, the Navigation Structure list.

Edit `docs/architecture/module-contract.md` twice.

1. The Navigation row. It reads "Workspace entries and admin entries with required permission". Add a third kind: a navigation tree, which is grouped and collapsible entries the module builds from the records the person may reach. State that the module returns the tree and core renders it, and that core never reads a module table to build it.
2. The closing paragraph, "How the contract grows". It lists foreseeable points that are deliberately not built, and that list includes a dashboard widget slot. The navigation tree moves out of foreseeable and into built, so make sure the list does not still imply it is missing.

## Change 4: settle SVG sanitizing in DEC-20

The design states that core sanitizes an SVG upload, and it cites `DEC-20`. `DEC-20` does not mention sanitizing. Read it and confirm this before you edit.

Evidence: `product/sections/branding/spec.md` in the design tree states it twice.

The risk is concrete. A logo SVG is served from the deployment's own origin, so an unsanitized file is a stored script on a trusted origin.

Amend `DEC-20` in `docs/core/decision-log.md`. Follow how `DEC-40` amends ADR 0006: keep the original text and add the amendment with its date. The amendment must state that every uploaded SVG passes a sanitizer in core before the bytes are stored, name the library, and name what is stripped, at least scripts, event handlers, external references, and foreign objects. Add the sanitizer to `docs/core/tech-stack.md` in the same change, with a one-line reason, because a new dependency must land there.

If you judge that sanitizing is not worth the dependency, state that instead and remove `image/svg+xml` from the accepted types in `DEC-20`. Do not leave the design's citation unsupported either way.

## Change 5: close the design handover gap

`docs/design/` is empty, and `docs/README.md` marks it "Empty, awaiting design owner". That gap is why four design decisions lived in one tree only.

1. `docs/design/README.md`. Add the handover rule: the design owner copies the design tree's `product/` folder here on every handover, which is the specifications, the sample data, the types, the captures, the token file, and the shell specification.
2. `docs/core/decision-log.md`. The entries carry `Designed in`, `Implemented`, and `Revisit` lines. Add one more line to that convention, "Design files affected", which the author fills in when a decision changes a screen. State the convention where the format is described, and add the line to `DEC-47`.
3. `docs/README.md`. Update the `design/` status only when files actually land. Do not claim a handover that has not happened.

## Raise, do not decide: the Dashboard landing page

The design renamed the landing page to Dashboard, and that page holds the solutions catalogue with recents, favorites, and categories. No document here names a Dashboard. The nearest idea in `docs/architecture/module-contract.md` is "a dashboard widget slot on the Solutions hub", which is the reverse arrangement: a slot on the module's own page, not a core page rendering a module's catalogue.

The reverse arrangement needs a contract rule that does not exist, so do not invent one.

Add it to `docs/core/vision.md` as the next `OPEN-n`. The question: is the landing page the solutions module's own hub, with Dashboard as a later core page holding declared widget slots, or does core own the landing page and gain a landing-slot contract point? The default until decided: the module's hub is the landing page, as `docs/modules/solutions/README.md` describes it today.

## What not to do

- Do not change `docs/modules/solutions/README.md`. The solutions module is not in scope.
- Do not change any ADR. None of these five items reverses a foundation choice.
- Do not renumber an existing `DEC-n` or `OPEN-n`.
- Do not edit a diagram's HTML. Edit the JSON source and regenerate.
- Do not decide the Dashboard question.

## Verify before you report

1. `grep -rn "secondary_color\|accent_color\|secondary_foreground\|accent_foreground" docs/` returns nothing.
2. `grep -rn "resolver from id to label" docs/` returns nothing.
3. `DEC-47` has an entry in `docs/core/decision-log.md` and a row in the Decided table in `docs/core/vision.md`.
4. The new `OPEN-n` has a row in the Open decisions table in `docs/core/vision.md`, with its default.
5. `DEC-20` carries a dated amendment, and the sanitizer is in `docs/core/tech-stack.md`, or `image/svg+xml` is gone from the accepted types.
6. Every document you touched still follows the writing rules in `CLAUDE.md`.

Report the changed files, the new ids you assigned, and anything you could not settle.

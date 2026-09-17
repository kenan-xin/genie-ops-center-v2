Record, not current. This file is history of one design round. It states positions that later decisions replaced. Read `../../core/decision-log.md` for what stands.

# Prompt 2: update genie-ops-center-v2/docs after the round-three decisions

Copy everything below the line into the docs agent.

---

You work in `/home/kenan/work/genie-ops-center-v2`. You edit documents only. Write no application code.

The first prompt landed. This is the follow-up. Three questions that the last pass left open are now answered, and your job is to record all three. The design tree at `/home/kenan/work/genie-ops-center-design` changes separately, by a different person. Do not edit it.

## Read first

1. `CLAUDE.md` in this repository, for the writing rules and the architecture invariants.
2. `docs/core/decision-log.md`, entries `DEC-47` and `DEC-48`, to copy the entry format.
3. `docs/core/decision-log.md`, `DEC-20`, to copy how a dated amendment is written.
4. `/home/kenan/work/genie-ops-center-design/findings.md`, items T1, T4, and N6. That is the evidence.

## House rules for this tree

- Never name a customer, and never reference a previous codebase.
- A core document describes the platform only.
- The next free decision id is `DEC-49`. The log ends at `DEC-48`.
- A resolved `OPEN-n` is removed from the Open decisions table in `docs/core/vision.md` and named in the Decided table. The id is never reused.
- This project tracks work with `bd`. Run `bd prime` first.
- Do not commit and do not push. Report the changed files at the end.

## Change 1: close OPEN-8. The module's hub is the landing page

The decision is the default that `OPEN-8` already recorded. The page after sign-in is the solutions module's own hub. No core page named Dashboard exists.

The reasoning to record: a core page that renders a module's catalogue needs a landing-slot contract point, and that slot would serve exactly one widget today, so its requirements would be guesswork. Core needs only to know which navigation entry is the landing route.

The reopen path to record: a Dashboard in core, with declared widget slots, when a second widget exists and has requirements. The module contract already lists a dashboard widget slot as foreseeable and not built, so that list is the path.

Edit these four places.

1. `docs/core/decision-log.md`. Write `DEC-49` in the format the other entries use. Cover the question, the decision, why, the trade-off, the guard, and the `Designed in`, `Implemented`, `Design files affected`, and `Revisit` lines. The design files affected are `design/product/shell/spec.md` and the shell components.
2. `docs/core/vision.md`. Remove the `OPEN-8` row from the Open decisions table. Add a `DEC-49` row to the Decided table.
3. `docs/architecture/module-contract.md`, the Navigation row. Add that one workspace entry can be marked the landing route, and that core sends a person there after sign-in. Keep the navigation-tree text that is already in that row.
4. `docs/architecture/module-contract.md`, the closing paragraph "How the contract grows". It names the dashboard widget slot and points at `OPEN-8`. `OPEN-8` no longer exists, so point at `DEC-49` instead and keep the slot on the not-built list.

Do not add a landing-slot contract point. The decision is that core does not get one.

## Change 2: the handover is text only

`docs/design/README.md` currently says the design owner copies the whole `product/` folder here. That folder holds roughly 250 captures, which is about 25 MB of binaries per handover, permanently in git history, and a changed capture is an opaque blob in a pull request.

Amend the handover rule. What lands here is the text: the section specifications, the `types.ts` files, the `data.json` files, `design-system/tokens.md`, and `shell/spec.md`. The captures stay in the design tree and are referenced by their path there, so a reviewer opens them where they live.

State why in one sentence: the text is what drifts and what a `DEC-` change must be checked against, so a reviewer can do that check in one repository and one pull request.

Leave the `design/` status row in `docs/README.md` alone. No files have landed yet. Change that row only when they do.

## Change 3: the brand color fills solid surfaces only

Record this so that nobody builds a color ramp that the design does not want.

The rule: the tenant primary color fills solid surfaces and the focus ring, which are the primary button, the count pill, the active navigation row's text, and the ring. Every tinted surface stays a fixed neutral gray, including the avatar background and the Admin portal pill. Core derives no tint ramp from the tenant color, so `packages/ui` needs no color-space computation and no per-step contrast check. Only `--primary` and `--primary-foreground` are computed, and `primary_foreground` is already stored.

Why: a derived ramp fails when a tenant picks a near-white or a near-black primary, and each derived step would need its own contrast check in both themes. A tinted surface that is blue while the tenant color is teal reads as half-branded, so those surfaces are gray instead.

Edit these two places.

1. `docs/core/decision-log.md`, `DEC-47`. Add a dated amendment in the style of the `DEC-20` amendment, carrying the rule and the reason above. Do not rewrite the original text.
2. `docs/core/roadmap.md`, Section 3, item 2, the tenant token layer. Add that the emitted variables are `--primary` and `--primary-foreground` only, and that no tint ramp is derived (`DEC-47`).

## What not to do

- Do not edit the design tree.
- Do not edit any ADR. None of these three reverses a foundation choice.
- Do not reuse the id `OPEN-8`.
- Do not change `docs/README.md`.
- Do not add a landing-slot or a widget-slot contract point.

## Verify before you report

1. `grep -rn "OPEN-8" docs/` returns only historical text, never an open row in `docs/core/vision.md`.
2. `DEC-49` has an entry in `docs/core/decision-log.md` and a row in the Decided table in `docs/core/vision.md`.
3. `grep -rn "Dashboard" docs/` returns only the `DEC-49` reasoning and the not-built widget slot, never a core page.
4. `DEC-47` carries a dated amendment, and `docs/core/roadmap.md` Section 3 item 2 names the two variables and the absence of a ramp.
5. `docs/design/README.md` names the text files and says the captures stay in the design tree.
6. Every document you touched still follows the writing rules in `CLAUDE.md`.

Report the changed files, the ids you assigned, and anything you could not settle.

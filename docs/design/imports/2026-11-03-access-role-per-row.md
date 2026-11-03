# Design import, 2026-11-03: the Access prototype, role-per-row model

Status: imported reference snapshot, owner review pending at the Phase 15 dry run. It is not design approval. The owner reviews the design and the built Access screens together at that dry run (owner, 2026-11-03). S2-21 to S2-24 build from it.

## Why

The owner accepted a new access model on 2026-11-02. A group or a person has access to a module exactly when it holds at least one role of that module (Specification 02, R-37 to R-37e and R-38). The Access design of 2026-09-18 showed levels, solution rows, a Show filter and a Broader access card, which the new model removes. Ticket S2-20 (bead `d8l5.30`) updates the design to the new model.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/prototype-access` from `chore/product-baseline` `56aab9d`, commit `1522072` (`docs(design): update the Access prototype to the role-per-row model`).

1. The design workspace held no Access prototype, so the prototype is a new single file. It was copied from `product/sections/access/access.prototype.html` to `sections/access/access.prototype.html`. The two copies are identical.
2. The 20 captures came from a headless Chromium run at 1440 x 900 and 390 x 844, light theme. They were copied to `sections/access/` as `prototype-<state>-<width>.png`, beside the captures of 2026-09-18.
3. `sections/access/spec.md` was rewritten to the new model. Its Captures section marks each old capture that the new model replaces. No old file was deleted.
4. The sample data is fictional: the tenant Harbor Point, people at `example.com`, and the four built modules with the owner defaults.

## States

Open the prototype in a browser. A deep link is `?screen=grants&state=<state>`, and `&theme=dark` gives the dark theme.

| State | What it shows | Requirement |
| --- | --- | --- |
| `role-choice` | Invoices swapped from Viewer to Finance, Modules and Core groups | R-37a |
| `add` | Add with the default access role | R-37a |
| `remove-confirm` | Remove confirmation with the roles that go and the paths that stay | R-37a, R-37d |
| `remove-last` | Remove confirmation with no other path | R-37a |
| `module-off` | Analytics switched off: no new grant, role choice read-only, Remove live | R-37a |
| `core-ask` | The Core group with Ask, role "Ask user" | R-37a |
| `overview-recipient` | Overview by person, 10 rows | R-37b, R-37d |
| `overview-module` | Overview by module, 21 rows on two pages | R-37b |
| `advanced` | Advanced access: one-record role, custom role, staged Auditor | R-37c |
| `advanced-guard` | The last-administrator guard on Tenant administrator | R-38, R-37e |

Each state has `prototype-<state>-1440.png` and `prototype-<state>-390.png`.

## Checks

- axe-core, WCAG 2.0 and 2.1 A and AA: 0 violations on the ten states at both viewports, 0 page errors.
- `impeccable detect` on the source file: 0 findings. On the rendered page: `nested-cards`, `overused-font`, `flat-type-hierarchy` and `straggler`. None breaks a token or an accessibility rule, so they are kept. The reasons are in the run record `access-design.md`.

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `sections/access/access.prototype.html` | Added | `b115f12c06c3a72b37c47f634860cd0c7419a9bd15e1c5359db25aa5f516191f` |
| `sections/access/spec.md` | Rewritten | not a copy, written in this repository |
| `sections/access/prototype-add-1440.png` | Added | `51fae2900a41f6f3d8be033f4ae7ef519873266285aabffa313f936bb9107989` |
| `sections/access/prototype-add-390.png` | Added | `5ad7c32fbea29656cb921014f0daead2a4650d2d70307d21eb91144810a800b5` |
| `sections/access/prototype-advanced-1440.png` | Added | `7903c1848f587710156025e17d1dd1147bf5bf00a7d434b8991839fcc775c715` |
| `sections/access/prototype-advanced-390.png` | Added | `965de4217d8df0652df6fe82e6cbfef39a0dafdb3490f6c302635913fddfe3c5` |
| `sections/access/prototype-advanced-guard-1440.png` | Added | `5cc797e720cdab58ff7c2a7e676d00bd660421847d71644453adb8ec4adcf077` |
| `sections/access/prototype-advanced-guard-390.png` | Added | `e9f005319b262f3ad1bec25252fb03f58b04f1274c0c99f2b375a192c659d48e` |
| `sections/access/prototype-core-ask-1440.png` | Added | `1c69ae3504a2ed0137bfa5daacaab4cc2368944a12dfe039794761be5c7ea270` |
| `sections/access/prototype-core-ask-390.png` | Added | `014e10fec9c2ebdee2117f8523c718eaf99c720c5fed382e667ead1c0c35d4dd` |
| `sections/access/prototype-module-off-1440.png` | Added | `6970f1ad4ea89f652367d633f0a8ab1d6562e39957c8c659cc4987012d3be13f` |
| `sections/access/prototype-module-off-390.png` | Added | `6c1d81c0e67ecfbfed710de80264f47f248d5381f44d3d9348d9841faf8033eb` |
| `sections/access/prototype-overview-module-1440.png` | Added | `e107d884af987e620e2ea219225c3937336158cda42904b08a5e0d978ce744bd` |
| `sections/access/prototype-overview-module-390.png` | Added | `ceeef6748fa58a1c1396faa8766d7d7c3721568113c52c7fdebaefba7f2b8784` |
| `sections/access/prototype-overview-recipient-1440.png` | Added | `3984ecb380f08b5c00ea7c91e898d90724afd6aaa2b404634a4d5cdf79461b8a` |
| `sections/access/prototype-overview-recipient-390.png` | Added | `19125c1cfa1224c7d0275d2576bcc7708f8e0afd4864380922d726c5671cc168` |
| `sections/access/prototype-remove-confirm-1440.png` | Added | `a7ab7a4dcae1d190f77895a6fcd3ed8aa67da1d5139c6273afb156a564986ae6` |
| `sections/access/prototype-remove-confirm-390.png` | Added | `f32729428aabb03007ca5a90847593448ee175fe6a465049640ac671449f73ca` |
| `sections/access/prototype-remove-last-1440.png` | Added | `7d49fadfd641d240311ca392d1b115f6ce1245f2febe3f4cc46c7f41e6006bfc` |
| `sections/access/prototype-remove-last-390.png` | Added | `51a5b85a669484e31832712d6431a9ec12018e3baadb8771726b2f48b8ef9337` |
| `sections/access/prototype-role-choice-1440.png` | Added | `63674b8845e728ca86d1ae797d8ea3b4c3c430d3ff90b630d7caab920cbae0e5` |
| `sections/access/prototype-role-choice-390.png` | Added | `736b52722a2f11ff35a63a4843b1320ccb9bd3b698ba575f998d5753bcce1440` |

## Limitations

- The owner did not review the prototype yet. The choices that no requirement settles are marked "(owner review pending)" in `sections/access/spec.md`.
- The 35 captures of 2026-09-18, `data.json` and `types.ts` stay in `sections/access/` as history. The spec marks which captures are replaced. `data.json` and `types.ts` still describe levels and solution rows.
- The design workspace copy of `product/sections/access/spec.md` and `data.json` still holds the model of 2026-09-18. A later spec sync ports the rewritten spec, as the 2026-10-30 sync did.
- Captures are light theme only. The prototype supports the dark theme through tokens.
- The prefilled link `/admin/access?role=<id>` and the self-protection reason on the signed-in administrator's own row have no capture.
- The prototype is a single self-contained file with native controls. It does not replace the shadcn and Base UI implementation.

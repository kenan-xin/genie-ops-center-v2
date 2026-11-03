# S7-21: Seeded history documents show what was found

Bead: `czjw.82` (bug). Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-37 ("what was found") and R-59 (the seed). Owner, 2026-11-03 dry run, issue I2.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: nothing. Runs in P2-2 because it touches the inbox.

## Scope

- All 66 seeded history documents show "Nothing found", although each created an invoice or a payment. Find whether the seed writes no reading, or the inbox reads the wrong field, and fix it at the cause.
- A history row shows its type and its key facts, or the record it created.

## Acceptance

After the seed, a history row shows its type and its key facts or its record, at phone and desktop. A test fails on the old code. The shared definition of done in the [index](../README.md) also applies.

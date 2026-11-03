# S7-20: Clear counts on the Documents inbox tabs

Bead: `czjw.68`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-37. Owner, 2026-11-03 dry run, issue I10.
- The [Spec 7 ticket index](../README.md).
- Prototype: `list-filters.prototype.html?variant=C&screen=documents` in the design workspace, branch `chore/prototype-list-filters` (`541715e`).

## Dependencies

Depends on: S7-19. The bead was filed against the inbox chips. R-37 now replaces the chips with status tabs, so this ticket covers what is left: how a tab shows a zero count.

## Scope

- Run the `impeccable` clarify command on the inbox tab counts. An empty tab never reads as "Needs you 0": hide the zero, or say "Nothing needs you".
- The count reads as a count, at 390 and 1440.

## Acceptance

No tab shows a bare zero count. Stories with axe for an empty and a full inbox. Captures at 390 and 1440. The shared definition of done in the [index](../README.md) also applies.

# S7-26: Placeholders that never read as values

Bead: `czjw.65` (bug). Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-28 and R-37a (a placeholder is grey and regular, a set value is tinted and semibold). Owner, 2026-11-03 dry run step 3, issues I6 and I7.
- [Design tokens](../../../design/design-system/tokens.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: S7-16, which replaces the due date text input with a date picker. That supersedes the date picker option of this bead.

## Scope

- Placeholders in `packages/ui` input, textarea, select and input group are clearly distinct from values, with readable contrast, in light and dark.
- No placeholder is a realistic value. Use a format hint instead.
- The reason that Save is disabled shows next to Save, not in small helper text (I7, folded by the coordinator).
- Check every input with a placeholder in Section 7: review forms, list search and the chat composer.

## Acceptance

Stories and captures at 390 and 1440, in light and dark. axe passes on the changed inputs. The shared definition of done in the [index](../README.md) also applies.

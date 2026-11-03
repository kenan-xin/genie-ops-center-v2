# S7-16: A date picker for every date input

Bead: `czjw.66`. Status and claims live in Beads, not in this document.

## Governing documents

- Owner, 2026-11-03 dry run, issue I8. It reverses wave 4 deviation D11 and folds redesign choice 7 and D13. No numbered Spec 7 line covers it, so the acceptance comes from the bead.
- [UI development](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: none. The shadcn Date Picker (Calendar and Popover) is the source.

## Dependencies

Depends on: nothing. Runs in P2-1 after `6wz1.89`. S7-19 and S7-26 use its picker.

## Scope

- Adopt the shadcn Date Picker into `packages/ui` through the shadcn workflow. Add `react-day-picker` to `../../../core/tech-stack.md` with its reason.
- Replace every date input: the review due date and the other review date fields, the Invoices and Payments list date range, the audit log date filter, the reporting date in Settings and the dashboard date range. The bead notes list the files found on 2026-11-03.
- Show dates in the app format (25 Nov 2026), keep keyboard entry, and support phones.

## Acceptance

No plain date input is left in the app. Stories with axe for a single date and a range. Captures at 390 and 1440. The shared definition of done in the [index](../README.md) also applies.

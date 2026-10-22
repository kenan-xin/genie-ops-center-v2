# packages/config/oxlint/design-system

Design-system ownership rules, written as an Oxlint plugin for this repository.

## What belongs here

A rule that keeps a design-system part with its one owner, `@genie/ui`. Today that is `single-owner` (Spec 3 R-19a): outside `packages/ui`, it refuses a declaration or export named `ConfirmDialog` or `focusRing`, and a JSX `role="dialog"` or `role="alertdialog"`.

## What must not go here

The import direction, which belongs to `boundaries`. A class or token rule, which belongs to `@shadcn/lint`. Vendored code.

## What it imports

`@oxlint/plugins` only.

# tools/generators/scripts

The runnable proofs for what the generators produce.

## What belongs here

A script that generates into this workspace, puts the result through the ordinary
gates and removes it again. `prove-generated-module.ts` is that proof for a module
(AC-7); `assert-discovered.ts` is the discovery half it calls, reading the same
data-only selection the application registry and the Storybook host read.

## What must not go here

A fixture that stays. Every module these scripts create is disposable: the host
module list, the default selection and continuous integration never gain one, and
the workspace is restored on every exit path, including a failing gate. A module
declaration import: discovery reads package metadata as data. A widened
authorization stub to make a generated test pass.

## What it imports

The Node standard library, the selection resolver in `../src/selection/`, and the
shared Storybook configuration from `@genie/config`.

# packages/core/contracts

The cross-module contracts surface: the event contracts and the capability interface registry
that an emitting module and its subscribers both import, so no module ever imports another.

## What belongs here

A cross-module event contract (`defineEvent`) and a named capability interface added to
`CapabilityInterfaces` when a real module needs one, in the same change that documents it in the
module contract.

## What must not go here

A core type or service (those live in `src/`), a module import, and anything but zod: this
surface imports zod and TypeScript types only (DEC-42).

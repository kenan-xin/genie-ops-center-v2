# packages/core/src/lib/module-contract

The module contract types shared by core and every module.

## What belongs here

The module contract types, the permission-key primitives, and the validators that check a declared contract against them. A type here must carry no runtime dependency beyond zod, so a module can import it without pulling in the core runtime.

## What must not go here

A service, a database read, and anything that imports a module. A module never imports another module, and this folder must not become a path for core to reach into one.

## What it imports

Type-only library declarations and zod. Nothing from the core runtime, nothing from `apps/`, nothing from `packages/modules/`.

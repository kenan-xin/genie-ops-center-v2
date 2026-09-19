# packages/modules

One folder per capability module.

## What belongs here

A capability module, named by what it does and never by the customer who asked for it. Generate a module with `nx g @genie/module:new <capability>`.

## What must not go here

A customer folder, a deployment configuration file, core code, or shared user-interface primitives. A module never imports another module.

## What it imports

Nothing. This folder holds no code of its own.

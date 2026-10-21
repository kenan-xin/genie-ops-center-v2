# packages/ui

The shared user-interface primitives for every deployment in this repository.

## What belongs here

Design tokens, primitive components, and composed components that any module or app renders. Components follow the UI development workflow: a documented story and a browser behavior test before implementation.

## What must not go here

Business logic, data fetching, module-specific screens, and any import of an internal project. A design primitive never knows which module renders it.

## What it imports

No internal project. This package is the base of the import direction. Core, modules, and apps may import it, and it imports nothing internal.

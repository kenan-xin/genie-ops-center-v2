# packages/core/src/lib/build-safety/__fixtures__

The negative controls for the two build-safety detectors.

## What belongs here

An entry point that a probe process loads in order to make one detector fire:
code that resolves a banned database driver, and code that opens a real socket.
Each one exists so that a passing build-safety test means something.

## What must not go here

A fixture that starts nothing, a test, a helper shared with another folder, and
anything a production build can reach. Nothing here is imported by the runtime,
and nothing here is part of the package's public surface.

## What it imports

Node builtins and `pg`, which is the very specifier the module-graph detector
watches for.

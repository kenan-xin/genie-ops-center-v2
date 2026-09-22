# src/module-new

The rendering half of `nx g @genie/generators:module-new <capability>`: a module package wired to
every point of the module contract, produced as text (R-30).

## What belongs here

The file templates and the names derived from one module id. `renderModule` returns
a map from repository-relative path to file content and writes nothing, so a caller
chooses the destination and a test reads the result without a filesystem.

The rendered package follows the accepted migration contract: each SQL file is
declared with a static `new URL(..., import.meta.url)` at module scope, and the
history is a function that core calls at bootstrap. Neither the generator nor the
rendered module reads a SQL file when it is imported.

## What must not go here

A copy of the module contract types, which belong to core. A read of the workspace,
a filesystem write, or an import of a module declaration: this folder produces text
and evaluates nothing. A permission grant: the rendered module carries only its own
keys, so the unchanged Section 0 authorization stub refuses it, and a rendered test
that needs a granted key waits for Section 2 rather than widening the stub.

## What it imports

The Node standard library, the shared naming invariant in `../workspace/`, and its
own files.

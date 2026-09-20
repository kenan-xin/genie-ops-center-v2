# packages/core/src/lib/build-safety

The proof that importing core's public build-safe entry points starts nothing: no
database driver resolved, no socket connected, no DNS lookup made.

## What belongs here

The preload a probe process registers before loading an entry point, the two
negative-control fixtures that prove each detector fires, and the test that runs
real Node processes against the package's public subpath exports with no
deployment environment set.

## What must not go here

A service, a connection, or any production code. Everything here is test-side
proof; nothing in the runtime imports it.

## What it imports

Node builtins only (`node:module`, `node:net`, `node:dns`, `node:fs`) and the probe
harness in `src/__testing__/`. The control fixtures import `pg`, which is core's own
dependency and the very specifier the module-graph detector watches for.

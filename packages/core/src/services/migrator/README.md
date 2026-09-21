# packages/core/src/services/migrator

The migrator that runs at container start.

## What belongs here

The run over one reserved database session: the lock wait limit, the one advisory lock, core's history, then each included module's history in registry order, then the unlock. The plan and the lock key live here too.

## What must not go here

A pool of its own, a second lock key, a history that belongs to a module, and any work dispatched to another session. The whole run holds one session, because an advisory lock belongs to the session that took it.

## What it imports

Drizzle's node-postgres migrator, the pg types, and the error catalogue and tenant-context types beside it.

# packages/core/src/lib/errors

The one application error catalogue and the shape a failed request returns.

## What belongs here

The catalogue of stable application codes with their fixed safe messages, the `AppError` that carries a code and keeps the original error as its cause, and the function that builds the safe body from an error and a request id. A later section adds its codes to the same catalogue.

## What must not go here

A transport. The route handler helper and the tRPC error formatter live with their adapters and both read this catalogue. Nothing here formats a log line, opens a connection, or puts an upstream message, a database message, a cause or a stack trace into a response.

## What it imports

Nothing.

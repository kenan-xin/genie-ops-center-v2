# S0-04 evidence

Bead: `genie-ops-center-v2-1rd.4`. Branch `feature/s0-04-context-migrator`, base `7890530`. Recorded 2026-09-21. The dependency window has [its own record](dependency-evidence.md).

This file grows as the ticket does. It states what was run and what the run said. Nothing here claims a database proof: the Docker runtime gap is bead `genie-ops-center-v2-2tc`, and it still blocks the acceptance of this ticket.

## Corrections to the first slice

The review of the first commit raised three defects. Each correction has one mutation that fails one test, applied to the working tree and reverted.

### Every list entry is validated

`GENIE_CHAT_API_ALLOWED_ORIGINS` accepted anything starting with `https://`, so `https://` alone and `https://host/path` passed. `AUTH_TRUSTED_PROXIES` refused the exact string `0.0.0.0/0` and accepted `not-an-ip`. The environment contract says each entry of a list is validated at start, so a typo fails the boot and not a request.

An origin must now parse as a URL with the `https:` scheme, a host, no credential, no query, no fragment and no path beyond `/`. A proxy entry must be an IP address, checked with `node:net`, with an optional prefix length inside its family's range. A prefix length of zero covers the whole internet, which is what the contract forbids by naming `0.0.0.0/0`; the IPv6 spelling of the same range is refused for the same reason, which is my reading of the rule rather than a second rule.

| State | Result |
| --- | --- |
| The new cases against the old checks | 12 failed, 25 passed |
| Against the new checks | 37 passed |

The cases include the malformed entries above, valid controls (`https://a.example.com`, `https://a.example.com:8443`, `10.0.0.1`, `10.0.0.0/8`, `fd00::1`, `fd00::/8`), and a list where only the second entry is broken.

### An error code and message come from a definition, never from a caller

`AppError` took any string as a code and an optional `safeMessage`, and `safeBodyFor` returned both, so upstream text could have reached a client through either field.

An error is now raised with a definition, a frozen `{ code, message }` pair. Core's definitions are `CORE_ERRORS`, built once from the catalogue. A module builds its own with `defineModuleErrors("placeholder", { "record-locked": "That record is in use." })`, which validates the id and each code as kebab-case, refuses an empty message, and freezes the result. There is no shared mutable registry: a module's definitions are a local frozen object. The constructor refuses a code that is neither a core catalogue entry nor `<id>:<code>`, so a definition built from database text is rejected where it is raised.

| State | Result |
| --- | --- |
| The constructor's code check removed | 1 failed: a caller's own text is accepted |
| As written | 17 passed |

A separate case proves the transport path: `safeBodyFor` given a caught `Error` whose message is `duplicate key value violates unique constraint "x"` answers the generic code and message, and the serialized body holds neither the constraint text nor the wrapped cause.

### A valid code with a caller's message

A valid code and a frozen object are not enough on their own, because a caller can write an object literal with a real code beside its own text. Two rules close that.

A core code takes its message from the catalogue, whatever the caller supplied. A definition with any other code must carry a mark that `declare()` sets with `Object.defineProperty`, not enumerable, so an object spread of a real definition does not copy it. The symbol is module-private and no entry point exports it, so ordinary code cannot write it.

The limit of that claim, stated plainly: `Object.getOwnPropertySymbols` on a real definition finds the symbol, so code written to defeat the guard can. This is not a sandbox against hostile code inside the image. A module declaration author is trusted, and the rule the guard supports is that a definition holds text its author wrote, never a value from a request, a database or an upstream service. What the guard does buy is that the ordinary ways to get it wrong, an object literal at a throw site and a spread with the message replaced, fail loudly.

The cases, all through the supported API:

| What the caller does | What happens |
| --- | --- |
| `new AppError({ code: <database text>, message: <database text> })` | refused, `not a declared error` |
| `new AppError({ code: "placeholder:record-locked", message: <database text> })`, the code spelled correctly by hand | refused, `not a declared error` |
| `new AppError({ code: "internal-error", message: <database text> })` | accepted, and the message is the catalogue's; the serialized body holds none of the text |
| `new AppError({ ...placeholderErrors["record-locked"], message: <database text> })` | refused: the spread drops the mark |

| Mutation | Result |
| --- | --- |
| The mark made enumerable, so a spread carries it | 1 failed |
| The caller's message trusted for a core code | 1 failed |
| The mark replaced by a check of the code's shape | 1 failed |

### The package root exports the factory

`packages/core/package.json` maps `.` to `src/index.ts`, and that file read `export {}`, so `createTenantContext` was unreachable through `@genie/core` however complete its implementation was. The root now exports the tenant-context factory and its types, the environment validator, the error catalogue, the authorization seam and the module-contract surface. `packages/core/src/index.test.ts` imports the package root, builds a context through it, and asserts that no `db`, `pool`, `settings`, `branding` or `storage` singleton is exported (R-17).

| State | Result |
| --- | --- |
| `src/index.ts` back to `export {}` | 3 failed in the package-root test |
| As written | the file passes with the rest |

The build-safe subpaths are unchanged: the build-safety suite imports every subpath except the runtime root and still reports no resolved driver and no connection.

## The placeholder module

The module now declares what R-15 fixes: the identity, the `placeholder_record` table with a UUID key and both timestamps, a migration history generated by drizzle-kit into `packages/modules/placeholder/drizzle` with the table `__drizzle_migrations_placeholder`, the three permission keys, the `Placeholder user` default role, the record type with its resolver, four navigation entries with one workspace entry for each DEC-51 category case and an ordered pinned list, a workspace page and an admin page, a configuration schema with one field of each of the five kinds, and one HTTPS frame origin. No entry carries the landing flag.

The router mounts one read procedure at `placeholder.read`. It calls `can(ctx.caller, "placeholder:read")` before it reads, and reads through `ctx.tenant.db`. Its unit tests give the context a database that throws on any property access, so a refusal proves the check happened before any read, and the granted case proves the read starts. That object stands in for nothing: the rows themselves are proved against a real Postgres in `packages/modules/placeholder/testing/`, which waits on 2tc.

The module owns its factory, `testing/factories.ts`, which inserts a real row through the tenant context. Core imports no module (R-39).

## The response body cannot be rewritten

Three further review findings, each about state a client reads. They are listed together because they are one audit: a definition, an error instance and the exported catalogue.

| What was writable | What holds now | Regression |
| --- | --- | --- |
| `AppError.code` and `AppError.safeMessage` were ordinary fields, so `Object.assign(error, { safeMessage: <database text> })` changed the body | both are defined with `writable: false` and `configurable: false` at construction | the assignment raises a `TypeError`, and `safeBodyFor` still answers the catalogue's code and message |
| `CORE_ERROR_MESSAGES` was an exported mutable object, and both generic paths read its entry | the catalogue is frozen, and the generic message is captured at load into a module-private value that the generic paths read | rewriting the catalogue raises a `TypeError`, and `safeMessageFor` for an undeclared code and `safeBodyFor` for a caught error both still answer the canonical text |
| A definition could be assembled at a throw site | a core code takes the catalogue's message, and any other code needs the non-enumerable mark `declare()` sets | the four cases in the table above |

The cause and the stack are untouched: a test asserts that an `AppError` keeps the error it wrapped and a stack naming `AppError`, because the log needs both.

## The module is reachable through its declared entry point

`packages/modules/placeholder/src/index.ts` exported the presentation only, so `placeholderModule` was unreachable through `@genie/module-placeholder`. The package now declares two entry points: `.` for the module-facing declaration, the router and the schema, and `./presentation` for the components a story and the shell render. Keeping them apart is what stops a browser bundle from pulling the router, drizzle and tRPC.

The test reads each subpath out of the manifest and imports the file the manifest names. It does not import the package by name, because the import boundary forbids a module importing a module package, its own included, and reading the manifest is also what catches the real defect: an entry point that maps to a file exporting something else. A case also asserts that the presentation subpath exports no router, schema or declaration.

That test proves what each entry file exports. A second test, `src/resolution.test.ts`, proves where the names land: it builds a throwaway consumer directory with one symlink to this package and a manifest of its own, and asks Node to resolve `@genie/module-placeholder` and `@genie/module-placeholder/presentation`. They resolve to `src/index.ts` and `src/presentation/index.ts`, and an undeclared subpath raises `ERR_PACKAGE_PATH_NOT_EXPORTED`.

The consumer resolves and does not import. Node's type stripping does not read `.tsx`, and the declaration reaches page components, so a plain Node process cannot load the graph. The two tests together are the proof: one says where a name lands, the other says what that file exports. A consumer that imports the package by name and mounts it is the app harness of R-20, which is not this ticket's surface and which I did not touch.

The package and `src/` READMEs now describe the two surfaces and the imports the module really has.

## The migrator, the logger and the test helpers

The migrator applies core's history first and then each included module in registry order, on one reserved client that sets the lock wait limit, takes the one fixed advisory lock, applies every history and unlocks (R-25, R-25a, R-26). A lock timeout becomes `migration-lock-timeout` and a failed history becomes `migration-failed`, each keeping the original error as its cause. Cleanup never turns a failed run into a successful one, and a session whose cleanup did not confirm is destroyed rather than returned to the pool (R-26a). Its unit tests cover the plan order and the lock key; the session behavior is what the real-database acceptance proves, and that waits on 2tc.

### Cleanup after a lock the run never got

The review found that `SET lock_timeout` ran before the lock, and that cleanup returned at once when the lock was not held. A timeout therefore handed a client back to the pool with the setting still on it.

The two facts are tracked apart now. `sessionCleanupPlan({ settingApplied, locked })` answers the steps: `unlock` only when the lock is held, `reset` only when the setting applied, in that order. `releaseMode(confirmed)` answers `reuse` or `destroy`, and an unconfirmed cleanup destroys the client rather than returning it. A cleanup failure is logged and swallowed, so the acquisition or migration error stays the error the caller sees.

| State | Plan |
| --- | --- |
| setting applied, lock timed out | `reset` |
| setting applied, lock held | `unlock`, `reset` |
| setting failed, no lock | nothing |
| setting failed, lock held | `unlock` |

| Mutation | Result |
| --- | --- |
| Cleanup skipped when the lock was never held, which is the old behavior | 2 failed |

The plan and the release decision are pure, so they are proved directly. `runMigrations` itself is proved through a recording client in `caller.test.ts`: a client that records each statement, fails the ones a case names, and notes whether it was released or destroyed. `MigrationRun.apply` is the one seam those cases use, and production passes nothing, so the real Drizzle migrator runs.

Those are unit proofs and nothing more. No lock is taken, no ledger is written and no migration is applied, so they say nothing about Postgres. The five cases are: a clean run sends `SET lock_timeout`, the lock, then the unlock and the reset, and returns the client; a `55P03` acquisition failure applies no history, still sends `RESET lock_timeout`, sends no unlock, and raises `migration-lock-timeout`; a reset that also fails after that timeout destroys the client and keeps the acquisition error; an unlock failure after a failed history keeps the migration error with its original cause and destroys the client; and an unlock failure after every history applied raises `migration-failed` and destroys the client.

| Mutation | Result |
| --- | --- |
| `runMigrations` never calls the cleanup helper | 5 failed |

The execution of all this on a real session, with a real lock, a real timeout and a real reset failure, is the real-database acceptance, which waits on 2tc.

Core's own history is a scaffold generated by drizzle-kit, `packages/core/drizzle/meta/_journal.json` with no entries, because Section 0 creates no core table. The journal is generated, never hand-authored.

The logger is pino at the level `LOG_LEVEL` names, with the request, tenant and user ids on every line and redaction as a property of the logger.

Three paths reach a line, and all three are redacted. An object goes through the log formatter, where a walker replaces a secret by name at any depth and inside an array. A message string and any value interpolated into it go through pino's own `hooks.logMethod`, because the formatter never sees them. An error is replaced by a copy whose message and stack are redacted; the copy is built from the original's property descriptors, which is what carries `cause`, since `new Error(message, { cause })` defines it as not enumerable and an `Object.assign` copy loses it. The cause chain is walked and redacted, a cause that points back at an error it came from answers the copy already made rather than looping, and the error the caller passed is never changed.

An error reaches a line with its kind and its own fields. Two paths get there, because pino treats the error it was handed differently from one nested in an object.

The error pino puts under `err` is left to pino's own error serializer, so the line keeps `type: "AppError"` with `code` and `safeMessage` beside it. Walking that error here would turn it into a plain object, and pino would then report its type as `Object`, which is what the review found. Safety does not depend on skipping it: the argument hook already replaced it with a redacted copy, and that copy redacts every own field it carries, so a custom error's `password` or token-bearing endpoint is gone before pino sees it.

An error nested inside a logged object has no serializer of its own, and its fields are not enumerable, so walking its entries would answer an empty object. It is turned into `{ type, message, stack, cause }` plus its own fields, each redacted.

| Mutation | Result |
| --- | --- |
| The logged error walked as a plain object again | 1 failed: the kind and the code are lost |
| A custom error's own fields copied without redaction | 1 failed: the secret field reaches the line |

The cases read the serialized line the destination received. They cover nested headers, an array of tokens, an emailed link, a url with a credential in its userinfo, a token link as the whole message, one inside a longer message, one interpolated with `%s`, a bare `token=` pair, a link inside a logged error, a redacted cause chain that keeps `ECONNREFUSED` while losing the token beside it, an `AppError` whose fields are not writable keeping its cause, a cause that points at its own error, an unchanged original, and an ordinary link that survives.

| Mutation | Result |
| --- | --- |
| The cause dropped from the error copy | 2 failed |

`packages/core/testing` starts a disposable Postgres and applies the same histories in the same order the image applies them (R-28). It takes a module's history as an argument, because core imports no module (R-39).

## The database test has a target

The integration test was orphaned: the unit preset excludes `testing/` and nothing else collected it. The module now carries `vitest.integration.config.ts`, package-local, with `include: ["testing/**/*.integration.test.ts"]`, `passWithNoTests: false` so a file that stops matching fails the target, and a 120 second timeout for the container start. The script `test:integration` runs it, and Nx resolves the target from that script.

The intended command is:

```bash
nx run @genie/module-placeholder:test:integration
```

`nx show project @genie/module-placeholder` lists `lint`, `test`, `test:integration` and `typecheck`, so the target exists rather than being described. Discovery is proved without running anything, with `vitest list --config vitest.integration.config.ts` from the package, which prints the three cases of `testing/router.integration.test.ts`.

The target has never been run to completion, here or anywhere: it needs a container runtime, and bead `genie-ops-center-v2-2tc` holds that gap. Nothing falls back to a fake database and nothing is skipped to make it green. No preset in `packages/config`, no root Nx configuration and no dependency changed for this.

## Gates

From the worktree root, each Nx run with `--skip-nx-cache`.

| Command | Exit | Result |
| --- | --- | --- |
| `nx run @genie/core:lint` | 0 | `Successfully ran target lint` |
| `nx run @genie/core:typecheck` | 0 | `Successfully ran target typecheck` |
| `nx run @genie/core:test` | 0 | 215 tests passed |
| `nx run @genie/module-placeholder:lint` | 0 | `Successfully ran target lint` |
| `nx run @genie/module-placeholder:typecheck` | 0 | `Successfully ran target typecheck` |
| `nx run @genie/module-placeholder:test` | 0 | 17 tests passed |
| `pnpm run format:check` | 0 | 137 files |

## Not proved

- Every real-database path: the migrator's session behavior, the histories, the lock, the timeout, the cleanup, the router read and the two-context isolation test. Bead `genie-ops-center-v2-2tc` holds the runtime gap.
- That a green unit run says anything about the database tests. It does not: the unit preset excludes `testing/`, and the integration tests run under their own target.
- A consumer that imports the package by name and mounts the module, which is the app harness of R-20.
- Two-context isolation, which R-20 places in the app harness and S0-05 completes.

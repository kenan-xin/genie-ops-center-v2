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

The limit of that test, stated so no reader takes it for more: it proves that the file each subpath names exports the right members, and it does not prove that `@genie/module-placeholder` resolves to that file for a consumer. A by-name resolution proof belongs to a consumer outside this package, which is the app harness of R-20, and that harness is not this ticket's surface.

The package and `src/` READMEs now describe the two surfaces and the imports the module really has.

## The migrator, the logger and the test helpers

The migrator applies core's history first and then each included module in registry order, on one reserved client that sets the lock wait limit, takes the one fixed advisory lock, applies every history and unlocks (R-25, R-25a, R-26). A lock timeout becomes `migration-lock-timeout` and a failed history becomes `migration-failed`, each keeping the original error as its cause. Cleanup never turns a failed run into a successful one, and a session whose cleanup did not confirm is destroyed rather than returned to the pool (R-26a). Its unit tests cover the plan order and the lock key; the session behavior is what the real-database acceptance proves, and that waits on 2tc.

Core's own history is a scaffold generated by drizzle-kit, `packages/core/drizzle/meta/_journal.json` with no entries, because Section 0 creates no core table. The journal is generated, never hand-authored.

The logger is pino at the level `LOG_LEVEL` names, with the request, tenant and user ids on every line and redaction as a property of the logger: a walker replaces a secret by name at any depth, inside an array, and replaces a url that carries a token or a credential. Ten cases cover nested headers, arrays, an emailed link, a url with userinfo and an object that holds itself.

`packages/core/testing` starts a disposable Postgres and applies the same histories in the same order the image applies them (R-28). It takes a module's history as an argument, because core imports no module (R-39).

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
- That a green unit run says anything about the database tests. It does not: the unit preset excludes `testing/`, so `packages/modules/placeholder/testing/router.integration.test.ts` has never run, on this host or any other. No target wires it yet, and the preset that would belongs to `packages/config`, which another ticket owns.
- By-name resolution of `@genie/module-placeholder`, as stated above.
- Two-context isolation, which R-20 places in the app harness and S0-05 completes.

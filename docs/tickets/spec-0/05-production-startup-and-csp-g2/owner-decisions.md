# S0-05 decisions taken while the owner was away

The owner left on 2026-09-22 with these standing instructions: continue S0-05,
defer anything that genuinely needs an owner decision and block the tasks that
depend on it, consult Codex first and follow its advice when the advice is
proven, and log every decision here for review. No push and no integration into
develop without approval.

This file is the review queue. It has two parts. DECIDED records what was
settled and why, so the owner can overturn it cheaply. DEFERRED records what was
not settled, what it blocks, and what the owner has to choose between.

A decision belongs in DEFERRED, not DECIDED, when it changes an approved
requirement, widens the ticket's scope, adds a dependency the technology stack
does not list, or weakens an acceptance criterion. Everything else is ordinary
engineering judgment and is recorded in DECIDED without waiting.

## DECIDED

### D1. The tRPC acceptance test is typed from the module's own router

UPDATED 2026-09-22 after the Codex consult returned. The original decision, kept
below, was to accept the untyped client. Codex found a better answer and it is
now the one in force.

Codex confirmed, quoting the installed source, that `createTRPCUntypedClient` is
a supported public export and that both clients construct the same underlying
client, so decoding is identical. It also confirmed the compile failure is real.
Then it supplied a typed spelling that needs neither a contract change nor a
type assertion: alias the endpoint router from the module's own exported
`PlaceholderRouter` and type the client with that alias. The runtime still calls
the application router over the same batch link.

This is strictly better, because a typed procedure path cannot be misspelled,
and an independent review had found that a misspelled path would have satisfied
every assertion in that test. The fix round applies it.

The contract question is unchanged and still not S0-05's: making `Module.router`
generic so composition preserves procedure types is a core change with a blast
radius across core, every module and the app. It belongs to the ticket that owns
the module contract.

#### Superseded: the tRPC acceptance test uses the untyped standard client

2026-09-22, Task 4.

The plan specified `createTRPCClient<AppRouter>` followed by
`client.placeholder.read.query()`. That does not compile here. The module
contract types every module's router as `readonly router: AnyTRPCRouter`
(packages/core/src/lib/module-contract/module.ts), so composing the selected
modules through `Object.fromEntries` produces an index signature and no
procedure resolves statically. I read that type myself rather than trusting the
implementer's report.

The test now uses `createTRPCUntypedClient<AppRouter>` over the same
`httpBatchLink`, against the real server, reading the standard `data` envelope.

Why this is not a weakened criterion: the criterion asks that a standard tRPC
client decode the envelope with no custom transport. The client, the link, the
wire format and the parsing are all the standard ones. What is lost is
compile-time procedure resolution inside one test file. Runtime fidelity is
unchanged.

What would change this: making the contract's `router` field generic so
composition preserves procedure types. That is a core module-contract change and
belongs to the ticket that owns the contract, not to S0-05. A Codex consult is
running on whether a typed spelling exists without touching the contract; if it
finds one, this decision is reversed in place.

To overturn: say so, and the contract change gets its own bead.

### D2. Two install scripts denied rather than allowed

2026-09-22, Task 4.

Installing next-intl pulled two new transitive packages whose install scripts the
workspace policy refused. Both were denied in pnpm-workspace.yaml with `false`,
not permitted, and the reasoning is written beside them: both are prebuild
selectors and both platform packages are already installed.

The release-age policy was NOT relaxed. next-intl was pinned one patch back
instead, to the newest release the policy allows.

To overturn: nothing depends on it; flipping either entry to `true` is a
one-line change.

### D3. Task 5 adds no primitive dependency

2026-09-22.

This follows the owner's own recorded answer from 2026-09-21: build the
foundation only as far as S0-05's navigation actually consumes it, and do not
introduce an unused primitive dependency merely to establish the foundation. The
navigation is a heading and a list of links, so it needs no primitive. Disclosure
stays untouched, and whether it is re-based onto a Base UI primitive remains a
Section 3 question tracked as genie-ops-center-v2-ghe.

## DEFERRED

### D6. The proxy is the single request logger, and it forwards its id

2026-09-22, resolving F3 below.

I first left this for you as a requirement reading. On reflection that was the
wrong call, and a stop-time review pushed back correctly. R-44 says one line per
request. Two lines is not a reading, it is a violation. Only the CHOICE of which
site logs was open, and that is an engineering call I can make and you can
overturn in one line.

The choice: the proxy logs, the handlers do not.

Why the proxy rather than the handlers:

- It sees every request class, static assets included, so one line per request
  is true literally rather than only for handled routes.
- It already reads the published context, so its line carries the context id
  that the single-context acceptance check depends on. Nothing is lost there.
- It runs before the filesystem check, so a request that never reaches a
  handler is still recorded.

The correlation defect is fixed at the same time, and it was the real problem.
The proxy mints one id, sets it on the response as it already did, and now also
forwards it upstream with `NextResponse.next({ request: { headers } })`, which
the framework documents for exactly this. Handlers read that id instead of
minting their own, so the id in an error body, the id in the response header and
the id in the log are one value.

Consequence you will see in the tests: the single-context count returns from 48
to 24, one line per request. I am keeping it an exact count rather than the
plan's "at least 24", because an exact count is what catches a second logger
being added back by accident. That is the whole defect this fixes.

To overturn: if you want handler-level logging instead, the proxy's one call
goes and the handlers keep reading the forwarded id, so correlation survives
either way.

### F3 RESOLVED by D6. Original text follows.

### F3. One request now produces two log lines, with two different request ids

2026-09-22, Task 7. Does NOT block anything. It is a requirement reading, and a
correlation defect underneath it.

R-44 asks for one line per request. Two things now write one:

- apps/genie/src/proxy.ts logs every request, including static assets.
- every route handler and every page logs its own.

So a handled request writes two lines, and each mints its OWN request id with
`newRequestId()`. That is the part I would call a defect rather than a reading:
a client that is handed requestId X in an error body will find the handler's
line and not the proxy's, because they do not share an id. The ids are
unrelated, so the two halves of one request cannot be joined.

The reading you have to settle is which one should log:

- The proxy only. It sees EVERY request class, assets included, so it is the
  literal reading of one line per request. Handlers would keep their error
  logging and read the id the proxy forwards.
- The handlers only. Their line is the one that proves a handled request saw
  the published context, which is what the single-context acceptance reads.
  Static-asset requests would then be unlogged.
- Both, and accept two lines, but make them share one id.

I have not chosen, because the first two are requirement readings rather than
engineering calls, and the third leaves R-44 unmet on its face.

What this costs meanwhile: the single-context assertion is now coupled to the
proxy logging. Task 7 moved it from an exact 24 to an exact 48 rather than
relaxing it, which was the right instinct, but it means the number moves again
whenever a call site is added or removed. The plan's own Task 9 shape uses at
least 24 instead, which survives either answer.

### D5 WITHDRAWN. The advice was wrong for the installed Next, and it was caught.

2026-09-22. I decided D5 below on a Codex consult, dispatched it, and the
implementer refused to finish it. It was right to refuse, and this is the most
useful thing in this file.

What it found, by reading the installed Turbopack source at the exact version
rather than the documentation: in Next 16.3.5 a `raw` module rule maps to the
filesystem-tracing module type, which has no exports at all, so the import
resolves to `undefined`. The schema and the documentation promise a string
because a LATER commit makes `raw` an alias for a text type. That commit is not
in 16.3.5, and the `text` type the documentation implies is rejected outright.

The consequence had it shipped: the build passes, no SQL is emitted, the
disclosure looks closed, and the migrator then refuses at startup with "the
migration journal names 0000_boring_gargoyle, which no declared file provides".
A green build over a broken runtime. It stopped before running the gates for
exactly that reason, which is the behaviour I asked for and did not expect to
need.

It also ruled out the wrapper as a cause, by proving a bogus module type still
fails the build, so the configuration key is genuinely read.

The working tree is reverted to the committed, proven URL form. All 21 project
gates are green again.

One verified alternative, if you want the disclosure closed: `{ type: "bytes" }`
works on the installed version today, emits no SQL file, and gives the module a
real value. It yields a byte array, so the schema needs a decode step and the
migrator's input type widens. Whether the same import spelling also resolves
under Vitest, which runs these files outside the Next build, is NOT established
and must be proved before anyone takes it.

One piece of the attempt is sound and worth keeping if you revisit this: an
ambient declaration in the module's own src/ is not enough, because the
application compiles that file transitively and never sees a sibling
declaration. A reference directive at the top of the schema file fixed it and
both packages typechecked.

So F2 below is OPEN again, with better evidence than it had.

### F2 remains open. Superseded text of the withdrawn D5 follows.

### D5 (WITHDRAWN). Migration SQL becomes bundled data, so nothing is published

2026-09-22, resolving F2 below. Decided under your standing instruction, on a
Codex consult that quoted the installed Next source rather than reasoning.

The fix removes the public artifact instead of guarding it. Turbopack supports a
raw module type, documented in the installed schema as returning the file
contents as a string rather than emitting the file and returning its URL. So the
SQL is imported as a string and never becomes an asset at all:

  next.config.ts   turbopack.rules: { "*.sql": { type: "raw" } }
  schema.ts        import migration0000 from "../drizzle/<tag>.sql?raw"

Why this is better than the alternatives, and I asked for all of them:

- It deletes the exposure at its source. There is no public copy to serve.
- It also removes the file read that broke the build in the first place, so it
  sits underneath D4 rather than beside it.
- Tracing stops mattering entirely. The SQL is inside the server chunk, so the
  fragile property the whole earlier repair existed to protect no longer has to
  hold.
- The bytes are unchanged, so drizzle's ledger hash is unchanged. The file is
  247 ASCII bytes and its sha256 is the value already in the ledger.
- Vitest resolves the same `?raw` spelling natively, so the unit tests need no
  configuration change.

The rejected option worth naming: making the proxy refuse the public path. Codex
confirmed the proxy CAN see it, because routing runs the proxy before the
filesystem check and the proxy has no restrictive matcher. But it is containment
rather than removal: the schema stays published in the image, and anything that
serves static files without going through this server, a CDN or a reverse proxy
or a sidecar, walks straight past it.

THIS CHANGES THE ACCEPTANCE EVIDENCE, and you should know before you read the
final report. Today the proof is "exactly one SQL file reaches the image". After
this change the right number is ZERO: there is no file to reach it, because the
content is in the chunk. The property that still has to hold, and that I will
prove, is the one that always mattered: the container applies the migration to a
real database and the ledger hash equals the sha256 of the SQL file in the
repository.

Not yet applied. Task 7 is editing next.config.ts at the time of writing and
this fix edits the same file, so it lands immediately after Task 7 and before
Task 8.

To overturn: revert to the URL form and decide F2 below on its merits.

### F2. The built image publishes its migration DDL

Measured, not suspected. Against the built image, running against a real
database:

  GET /_next/static/media/0000_boring_gargoyle.3-bu8-fe23s4p.sql
  200, content-type application/x-sql, 247 bytes
  first line: CREATE TABLE "placeholder_record" (

Anyone who can reach the deployment can download its schema definition. There is
no credential and no data in it, so the image still holds no secret, but the
database structure is now public.

Where it came from, and it is new. A page now imports the generated registry, so
the SSR compilation processes the module's schema file and Turbopack emits its
own copy of the referenced asset into the public static folder. Before Task 6 no
page imported the registry, so no public copy existed. The runtime still reads
the server copy, which I verified: the ledger hash equals the sha256 of
/app/apps/genie/.next/server/assets/... and not of the public one.

Why I did not fix it. Every fix is an architecture change you should make:

- Stop pages importing anything that carries migrations, through a
  bootstrap-only subpath. Medium size. Removes the public copy at the source,
  because the SSR compilation would never see the URL declarations. This is the
  one I would choose.
- Generate two registries, one for mounting pages and one for the runtime.
  Larger, and it changes ADR 0008's one-registry shape.
- Accept it. Cheapest. Defensible if you consider DDL non-confidential, and
  indefensible if a customer deployment is reachable from the internet.

Note for whoever decides: this is not specific to the placeholder module. Every
module's migrations will be published the same way, so the answer is a platform
rule, not a one-off.

### RESOLVED: F1 became D4

F1 was deferred and then resolved by the Codex consult; it is recorded above as
D4, with the original deferral kept below so you can see what the question was.

### D4. Module migrations become a thunk, so a page can import the registry

2026-09-22, resolving F1 below.

This changes the module contract, which is normally yours to decide. I took it
under your standing instruction to consult Codex first and follow proven advice.
The advice is proven in the sense that matters: Codex read the two emitted build
chunks and showed the divergence directly, rather than reasoning about it.

What it found:

- The SSR chunk emits `/_next/static/media/<hash>.sql` while the Node server
  chunk emits `/server/assets/<hash>.sql`, from the same source expression. Both
  files exist in the current build. This is Turbopack's asset-module emission,
  equivalent to webpack's asset/resource, and no Next 16.3.5 setting changes it
  per compilation layer.
- `server-only` does not help. It keeps a module out of a CLIENT bundle, not out
  of SSR, so a Server Component page still evaluates it.
- A lazy `import()` does not help either, because the dynamic chunk is still SSR
  compiled.

The change: `ModuleSchema.migrations` becomes `() => readonly MigrationMeta[]`,
so the file read happens when the migrator calls it at bootstrap and never
during SSR.

THE CORRECTION THAT MATTERS, and the reason I did not simply take my own first
idea. I had assumed the whole `new URL` map would move inside the thunk. Codex
checked and said that is unverified: the only spelling PROVEN to be traced into
the image is the module-scope one, and it refused to vouch for tracing inside a
function body. So the URL declarations stay exactly where they are and only
`migrationsFromJournal` is deferred. Had I moved them, I would have risked the
one property the 5p4 repair exists to protect, and the build would still have
gone green.

What this costs: a missing migration file is no longer caught at first import.
It is caught when the migrator runs, which is before the server answers
anything, so a broken image still fails at startup rather than serving traffic.

Blast radius, small and all in packages: the contract field, `moduleHistory`,
two contract fixtures, the placeholder schema and module, and one placeholder
test. No application source changes.

Proof required before I accept it, and the agent doing it must show all six:
reproduce the build failure first, then the build passing, then exactly one SQL
file inside the built image, then the image suite applying it against a real
database, then the core and placeholder real-database suites.

To overturn: the alternatives are in F1 below, ranked. Reverting means Tasks 6, 7
and 9 are blocked again.

### F1. RESOLVED by D4. A page cannot import the module registry

2026-09-22, Task 6. BLOCKS Tasks 6, 7 and 9, which is most of what is left.

What happens: a React Server Component page imports the generated registry so it
can mount the pages a module declared. That import chain reaches
packages/modules/placeholder/src/schema.ts:43, which calls migrationsFromJournal
at module scope, and packages/core/src/services/migrator/history.ts:57, which
reads each migration's SQL with readFileSync. In the Node-target server
compilation the URL resolves correctly. In the SSR compilation for a page,
Turbopack rewrites the same expression into a public asset URL under
/_next/static/media/, which readFileSync cannot open. The build fails with
"Failed to collect configuration for /placeholder".

This was proven, not guessed: making that one read non-throwing, and changing
nothing else, makes the build exit 0. A lazy import() does not help, because the
dynamic chunk is still SSR-compiled, so the first request would throw instead of
the build.

Why the read exists: it is the genie-ops-center-v2-5p4 repair you approved and
integrated. Declaring migrations as traced file references is what finally got
the SQL into the image. That property is verified end to end and must not be
lost: exactly one SQL file reaches the image, and a container started from it
applies the migration to a real database with a ledger hash byte-identical to
the file's sha256.

Why this is yours and not mine: every candidate fix changes something approved.

- Make ModuleSchema.migrations a thunk, so the read happens only when the
  migrator calls it. Smallest code change, but it is a module-contract change,
  it touches core, the module, the contract tests and the docs that
  genie-ops-center-v2-7fw already covers, and it gives up failing at first
  import when a migration is missing.
- Publish the registry on the process-global context slot, the way the viewer
  providers already are. Avoids the contract change, but page components would
  then cross React instances, which is the kind of thing this ticket exists to
  avoid.
- Split what a page imports from what the bootstrap imports, through an export
  subpath or a second generated registry. Larger, and it changes ADR 0008's
  one-registry shape.

What I am doing meanwhile: a Codex consult is running on whether Next 16.3.5
offers a supported way to keep the eager read, and on whether file tracing still
copies the SQL when the new URL calls sit inside a function body rather than at
module scope. That last point is the assumption the thunk option rests on, and
it is exactly the kind of assumption that is wrong. If Codex proves an option
sound, I will take it under your standing instruction and record it here as a
decision. If it does not, this stays deferred and Tasks 6, 7 and 9 stay blocked.

Task 6's work is written and uncommitted. Gate 1 and Gate 3 pass; only the build
fails, and only on this. Authorization was verified independently: the stub
still grants placeholder:read alone, and both placeholder pages are refused to
an anonymous caller, which is the behaviour the plan requires.

## NOTED, needs no decision

- oxfmt's print width in this repository is 80, set in
  packages/config/src/oxfmt/index.ts. The root CLAUDE.md tells every agent it is
  100. CLAUDE.md lives only in the main checkout and is ignored by this branch,
  so it cannot be corrected from the worktree. Worth one edit at the main
  checkout, because every agent reads that file and believes it.

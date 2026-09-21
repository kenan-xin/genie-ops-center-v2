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

Nothing yet.

## NOTED, needs no decision

- oxfmt's print width in this repository is 80, set in
  packages/config/src/oxfmt/index.ts. The root CLAUDE.md tells every agent it is
  100. CLAUDE.md lives only in the main checkout and is ignored by this branch,
  so it cannot be corrected from the worktree. Worth one edit at the main
  checkout, because every agent reads that file and believes it.

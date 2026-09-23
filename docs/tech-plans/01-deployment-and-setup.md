# Spec 1 technical plan

Confidence: 7.6/10. The spec is approved and its open lifecycle points were decided on 2026-09-23. The score is held down by three things that nothing has proven yet: bundling the worker and `genie-ops` entries so that their migration SQL reaches the image, pg-boss running over the context pool inside the caller's transaction, and a database read in the Next proxy for the setup gate.

Status: drafted 2026-09-23 for the product owner's review. D-8 and D-14 are owner decisions. The other decisions below were recommendations that a cold reviewer critiqued twice on 2026-09-23, adopted on the owner's instruction to write this plan; the owner can overturn any of them. This plan is self-contained: each decision states its reason here. This plan supplements [Spec 1](../specs/01-deployment-and-setup.md) and does not replace its numbered requirements. Implementation waits for the ticket reconciliation below.

## Scope and decision authority

Deliver Section 1 on the Section 0 foundation as built: the deployment tables and readers, the setup gate and `genie-ops setup`, the worker and job queue, the event bus, the file store, integrations, the mailer, the stack template and the lifecycle guards. Nothing here adds a user, a realm or authorization; that is Section 2.

| Accepted direction | Authority |
| --- | --- |
| pg-boss in the deployment database, own schema | DEC-12, R-4 |
| Buffered file bytes, 15 MB cap, `postgres` adapter only | DEC-20, DEC-44, R-32 to R-39 |
| Resend and Nodemailer adapters | tech-stack "Communication", R-43 |
| Squawk and `drizzle-kit check` as one pull-request job | DEC-43, R-13 |
| Registration in the migrator run, after `seed`, ledger rule and spelling | DEC-50 amendments, R-9, R-27, R-79 |
| Worker runs the same migrator run; a module with no row reads as disabled | DEC-50 amendment, R-5, R-27 |
| Generator owns the stack template | DEC-33 amendment, R-28 amendment (D-8) |
| Health answers 503 during a database outage | R-11 amendment (D-14) |

## Decisions

**D-10, runtime entries.** The runtime image today ships `.next/standalone`, `.next/static`, `apps/genie/public` and `deploy/entrypoint.sh`, and migration SQL reaches it only through the bundler's asset tracing. Build the worker and the `genie-ops` runner as their own bundled Node entries in the builder stage and copy them into the runtime stage. Install a `genie-ops` executable on `PATH`, because `docker compose exec <service> genie-ops ...` (R-62) runs without `entrypoint.sh`. Both entries must carry the migration SQL the way the app does, and the image test proves that the worker entry and `genie-ops` each start and migrate. One ticket owns this mechanism: `1ia.2` builds it with the `genie-ops` entry, and `1ia.8` adds the worker entry through the same mechanism. The worker serves no HTTP, so it writes a heartbeat file after each successful database round trip of its job loop, and its container health check fails when the file is too old (Spec 5 R-16, amended 2026-09-23). A `genie-ops health` command was rejected, because every command writes an audit row (R-64, DEC-45) and a health check every few seconds would flood the operator trail.

**D-1 and D-12, the tenant context.** `TenantContext` grows flat readonly members, built once in `createTenantContext`: the settings, branding and entitlement readers, the file store, the mailer and the job queue. Each reader keeps its own 10 second cache (DEC-46). The caller passes one list of compiled module ids into `createTenantContext`; the entitlement reader and the migrator run both read it there, so no caller holds a second copy. `apps/genie/src/bootstrap.ts`, the worker, `genie-ops` and the test helper are the callers.

**D-3 and D-13, the migrator run.** `MigrationRun` gains the omission check before the histories and the conditional registration insert after they commit, as injectable steps like the existing `apply?` seam, reading the compiled list of D-12. R-7 and DEC-46 make the readers the only code that reads `tenant_module`; the named exceptions are the migrator run (R-27, R-79), the `seed` step (R-20) and the enable procedure (R-68). A test proves that nothing else touches the table.

**D-11, pg-boss connections.** Build pg-boss over the context pool through its `db` option, as a fixed context member, and call `boss.start()` only after the migrator run returns. The application instance sets `supervise: false` and `schedule: false`; only the worker supervises and schedules. Keep `useListenNotify` off, because its connection sits outside the pool. Pin the version when it is added (12.33.6 was checked on 2026-09-23). Before a job runs, the worker checks the entitlement of the module that owns it.

**D-5 and D-6, transactions.** A core `withTransaction(ctx, fn)` gives callers one transaction. Durable event handlers are enqueued through pg-boss inside that transaction (`send(..., { db: fromDrizzle(tx, sql) })`), so a job commits or rolls back with the data (R-54, R-55). Fast in-process handlers run after commit and are best effort: a crash between commit and dispatch loses them, so a handler that must not be lost uses the durable channel (R-53). The file store writes the `file` row and the bytes in the caller's transaction (R-33). The later `s3` adapter writes the object before the row commits, so a rollback can leave an orphan object; that is its known ceiling.

**D-2 and D-14, the setup gate and health.** The gate runs in `apps/genie/src/proxy.ts` and reads `setup_step` through the context slot the bootstrap fills, because the proxy cannot import the core root that pulls in `pg`. A matcher skips static assets and health. Documents get the not-set-up page; tRPC, `/api/m/` and authentication routes (R-80) get a refusal; RSC and prefetch requests get no page body. Once satisfied, the gate latches open on the process-global slot for the life of the process; a guard test proves a setup rerun never moves a done step back to `pending`, and a database restored to an earlier state needs a restart. When the gate read fails, the request gets a generic 503. The health route does not use the latch: it checks the database on each call with a short timeout and answers 503 while the database is unreachable (D-14), with a test that stops the database after the latch opened. Under Docker Compose that marks the container unhealthy and the Spec 5 monitor alerts; `restart: unless-stopped` does not restart an unhealthy container.

**D-7, the mailer.** A fixed context member, built once from the validated environment, like the file store.

**D-4, `genie-ops` arguments.** Node `util.parseArgs` per subcommand, with a dispatch on the first positional argument; no new dependency. Catch every parse error and print a generic message, because `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL` echoes the value. The DEC-45 audit row records only an allow-listed set of arguments per command. A parse failure before the context exists writes a log line and exits nonzero, and writes no audit row, because R-65 audits through the context.

**D-8, the stack template.** The tenant generator renders the compose file, the Helm values and `.env.example` from `tools/generators/src/tenant-new/`. `deploy/stack/` keeps only the end-to-end test stacks. The Section 0 templates need rework in `1ia.9`: drop the Postgres service (the host supplies it, DEC-33), drop the host port, read `IMAGE_TAG` (R-30), join the `proxy` network with the slug aliases, add the worker and Keycloak services, add the container health checks (the HTTP check for the application and the heartbeat check for the worker, Spec 5 R-16), and generate `.env.example` from the environment schema.

## Delivery order and gates

1. **Tables and contract seams.** The core migration (R-1) that creates `tenant_module` and `setup_step`, `validateRegistry` enforcing the ledger name (Bead 1ia.11.1), then the `MigrationRun` extension with the compiled list (D-3, D-12), then `withTransaction` (D-5). The registration step needs the R-1 tables, so the migration comes first.
2. **Readers and the gate.** The readers and fixed members (D-1), the setup gate and health (D-2, D-14), `genie-ops setup` with `migrations` and `seed`.
3. **Services.** The file store, integrations, the mailer, the job queue and worker (D-10, D-11), the event bus.
4. **Operator surface and stack.** The remaining commands, the generated stack (D-8), the smoke test, the lifecycle guards.

**Gate S1-G1** after step 1: the extended migrator run passes the Section 0 migrator and isolation suites, with only the `createTenantContext` call sites updated for the compiled list, plus the omission and registration cases. **Gate S1-G2** after step 3: the worker entry and `genie-ops` start from the built image and migrate, the worker runs a placeholder job over the context pool, and an event survives a process kill after commit. **Gate S1-G3** at the end: Spec 1's acceptance criteria at phone and desktop viewports, the customer smoke test through the generated compose file, and the plan-level cases that no acceptance criterion names: health 503 after the database stops, the latch guard, the `genie-ops` parse guards, the D-13 table-access test, the per-job entitlement check and the in-transaction send.

## Ticket changes before implementation

The twelve draft tickets under Bead `genie-ops-center-v2-1ia` date from 2026-09-22, before the approval. Reconcile them against this plan:

- Split `1ia.1`: its R-1 migration lands in step 1, and its readers and fixed members in step 2.
- Split the `MigrationRun` extension into its own ticket. It depends on `1ia.1` and `1ia.11.1`, and `1ia.2`, `1ia.4`, `1ia.8` and `1ia.11` depend on it.
- Make `withTransaction` its own ticket, before `1ia.5` and `1ia.10`.
- Make `1ia.9` depend on `1ia.8`, because the compose file starts the worker, and note D-8.
- Name D-4 and D-10 in `1ia.2` as the owner of the entry mechanism, and make `1ia.8` depend on `1ia.2`, because the worker entry reuses that mechanism, and D-10 (worker entry only) and D-11 in `1ia.8`.
- Add the stack template rework of D-8 to `1ia.9`.
- Update the epic description, which still calls the spec a draft, and remove the `draft-breakdown` label once reconciled.

## Stop conditions

Stop and seek a revised decision when bundling an entry needs a second image, a custom server, or migration SQL copied by hand; when pg-boss cannot run over the context pool without its own connection; or when the proxy cannot read the gate without importing `pg`. Record the failed command, the versions and the smallest alternatives. Do not weaken the invariants of DEC-34, DEC-46 or DEC-50 to get past a gate.

## Assumptions

- pg-boss 12.33.6 or later keeps the constructor `db` option and `fromDrizzle(tx, sql)` for `send` inside a transaction. Checked against its documentation on 2026-09-23; the repository does not install pg-boss yet.
- The Next proxy of `apps/genie/src/proxy.ts` runs on the Node runtime and can read the process-global context slot, as the Section 0 viewer override already does.
- Node `util.parseArgs` behaves as documented for Node 26, including the value echo in `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL`.

## Unresolved

- Whether the Section 2 `roles` step seeds default role definitions for a module registered disabled. It belongs to Spec 2, and the recommendation is yes, without assignments.

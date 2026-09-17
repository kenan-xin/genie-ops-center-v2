---
status: superseded in part by ADR 0007 on 2026-09-17. Migrate before serving, the advisory lock, expand-then-contract, and the idempotent migrator still hold. Suspending one tenant does not; a deployment has one customer, and a failed migration keeps the container unhealthy while the previous version serves.
date: 2026-09-16
---

# Tenant databases migrate at deploy time, one failure suspends one tenant

Every tenant database receives the same set of migration histories: one for core and one per module in the image (ADR 0001, DEC-33). We decided that a release migrates every tenant database before the new version serves traffic, sequentially, each under a per-database advisory lock, and that a failure on one tenant database suspends that tenant with a recorded reason and lets the rollout continue for the others. Lazy migration on a tenant's first request is not used.

## Why

At-deploy migration keeps one simple invariant: a running version always sees the schema it was built for. Lazy migration breaks that invariant on every first request after a release and moves migration failures into user-facing requests, where they are hardest to handle. Suspending one failed tenant instead of aborting the release means one customer's database problem cannot hold every other customer on the old version, and the suspended tenant sees a maintenance page rather than a new version running against an old schema. An operator re-runs the migrator for that tenant and lifts the suspension.

## Considered options

1. Migrate at deploy, abort the whole release on any failure. Safest for schema consistency. Rejected because one tenant's problem then blocks every tenant's release, which does not fit a shared deployment for many customers.
2. Migrate lazily on first request after a release. Fastest startup. Rejected because it turns migration failures into request failures and lets a new version serve an unmigrated schema.
3. Migrate at deploy, suspend the failed tenant, continue. Chosen.

## Consequences

- Migrations are written expand-then-contract: a release only adds or widens, and a later release removes, so old and new replicas can overlap during a rolling deploy.
- The migrator is idempotent and callable for one tenant, so re-running it after a fix, and a future switch to lazy mode if tenant count ever makes startup time unacceptable, are both a flag rather than a redesign.
- `tenant.status` gains a `status_reason`, and the health endpoint reports suspended tenants so a release that suspended one is visible at once.
- A tenant that must approve every change before it reaches them does not get a special schema state inside the shared deployment. That customer gets a dedicated deployment pinned to a release.
- The migrator applies the core history first and then each included module's history in registry order, all under the one advisory lock. A module's tables never reference another module's tables, so the order among modules carries no meaning.
- In a dedicated deployment with one tenant, a migration failure makes the deployment unhealthy; there is no other tenant to keep serving.
- Startup time grows with tenant count. It is measured from the first release and becomes the trigger for revisiting this decision.

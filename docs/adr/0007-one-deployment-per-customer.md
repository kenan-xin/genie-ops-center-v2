---
status: accepted
date: 2026-09-17
supersedes: ADR 0001 (the shared deployment), ADR 0003 (every module in one image), ADR 0005 (suspend one tenant)
---

# One deployment per customer, one image per customer, one tenant context seam

Every customer runs its own deployment: one application image that contains core plus that customer's modules, one Postgres database, and one Keycloak realm. There is no shared multi-tenant deployment. A deployment is hosted by Genie on its own servers or by the customer in its own infrastructure, and the image is the same in both cases. All code stays in the one monorepo (DEC-22), every image is built from the one Dockerfile with `MODULE_INCLUDE` as a build argument (DEC-33), and every piece of code reaches the database, the settings, the branding, and the file store only through one tenant context object (DEC-34).

## Why

The first customer runs Genie Ops Center in its own infrastructure and must not hold any other customer's module code or table shapes. Once every customer that self-hosts needs its own image, database, and realm anyway, a second shape for Genie-hosted customers exists only to save compute for customers that do not exist yet. The planned scale is tens of customers, where one small container stack per customer costs less than the code it replaces.

What the decision removes from the design:

- The connection router and the per-tenant pool cache, with the pool arithmetic that exhausted a default Postgres at about ten active tenants (review defect 1).
- Hostname routing and per-request tenant resolution, and the risk that a cached server component or a memoised `can()` crosses tenants (review defect 4).
- The per-tenant Better Auth instance cache and its second lifetime beside the pool cache (review concern M2).
- The migrate-then-suspend rollout and the suspended-tenant state (review defect 3).
- The control-plane database, the deployment-wide Keycloak admin client, the per-tenant cookie key derivation, the process-global capabilities registry against per-tenant entitlement, and the per-tenant observability gap (review concerns M1, M4, M10, M12).

What the decision costs:

- One image build per customer per release, in CI minutes only.
- One stack to upgrade per customer per release instead of one for all. Coolify handles tens; Kubernetes with a rollout tool handles hundreds.
- Compute per Genie-hosted customer, one small application container and one worker, because nothing is shared in process. Postgres and Keycloak are still shared servers with one database and one realm per customer.
- A customer-managed deployment can lag by several versions, so expand-then-contract migrations are load-bearing and every release must be a valid upgrade from the last three.
- A return to many tenants in one process, if ever needed, costs a new ADR and a change to how the tenant context is built. DEC-34 keeps that change bounded.

## Considered options

1. One shared deployment for many tenants behind a connection router, plus a dedicated deployment for a customer that requires it (ADR 0001). Rejected because the two shapes double the operational surface and the shared shape carries the defects above.
2. One deployment per customer, hosted by Genie or by the customer, from one Dockerfile and one repository. Chosen.
3. One repository or one source drop per customer. Rejected in DEC-22 and DEC-33.

## Consequences

- The control plane disappears as a separate database. Module entitlements, module configuration, API keys, setup progress, and the pg-boss job tables live in the deployment's one database.
- Tenant isolation is physical: a different customer is a different stack. There is no `tenant_id` column anywhere, and there is no hostname lookup, pool cache, or per-request tenant resolution.
- Migrations run when the container starts, core history first and then each included module's history, under one advisory lock so several replicas do not collide. A failure keeps the container unhealthy and the previous version serving. Expand-then-contract stays the rule because a customer-managed deployment can lag by several versions.
- Every request, job, and page reads through one `TenantContext` object built once at startup from the environment. No global database, settings, or storage export exists in core, oxlint bans the driver packages outside core, and one integration test runs the placeholder module through two contexts against two databases in one process (DEC-34). This keeps a later return to many tenants in one process a change to how the context is built, not to the code that uses it.
- Every release builds one image per customer. Genie-hosted stacks upgrade through Coolify; customer-managed stacks upgrade by pulling the next tag. Kubernetes with one namespace per customer and a rollout tool is the path when the count of stacks makes Coolify slow.
- Infrastructure consolidates without code change: Genie-hosted customers share one Postgres server with one database each and one Keycloak server with one realm each.
- A return to many tenants in one process is a future ADR that changes how the tenant context is built. It is not designed now.


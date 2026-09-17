---
status: superseded in part by ADR 0007 on 2026-09-17. One database per customer and no tenant column still hold. The shared deployment, the connection router, and the control-plane database do not; every customer now runs its own deployment.
date: 2026-09-16
---

# One database per tenant, one deployment for many tenants

Genie Ops Center serves customers in government, healthcare, and finance whose security teams require strong data isolation and control over where data is stored and processed. We decided that every tenant gets its own PostgreSQL database, reached through a connection router from one shared deployment, and that no tenant table carries a `tenant_id` column. A dedicated single-tenant deployment, for a customer that requires its own region or premises, runs a per-customer image built from the same Dockerfile (DEC-33).

## Considered options

1. One shared database with a `tenant_id` column and PostgreSQL row-level security. Simplest to operate and the common SaaS default. Rejected because a single policy bug becomes a cross-customer leak, because regulated buyers do not accept a shared database in their security review, and because a customer who requires their own region or on-premises hosting cannot be served without a second product.
2. One full deployment per customer, each with its own code composition. Strongest isolation. Rejected because it multiplies operations per customer. Module code confidentiality, its other justification, is met by a per-customer image from the one application (DEC-33) rather than by a code composition per customer.
3. One deployment, one database per tenant, behind a connection router. Chosen. Isolation is at the database, realm, and hostname, while compute and the image are shared.

## Consequences

- A small control-plane database maps hostnames to tenant databases and holds module entitlements. It never holds customer data.
- Every tenant database receives the same set of migration histories, one for core and one per module in the image, applied per database under an advisory lock at deploy time (DEC-33).
- Better Auth runs as one instance per tenant, because sessions live in the tenant database.
- The application must be deployment-agnostic: code never knows whether it runs shared or dedicated. A dedicated deployment is a control plane with one tenant.
- Connection count grows with active tenants. The pool cache is capped and PgBouncer is the named upgrade path.
- Tenant resolution is by hostname, so browsers isolate cookies and sessions without application code.
- File bytes live in the tenant database by default (DEC-20), so a tenant's documents share its isolation, backups, and retirement with no second storage system to manage.

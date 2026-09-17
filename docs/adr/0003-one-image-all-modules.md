---
status: superseded in part by ADR 0007 on 2026-09-17. One repository, modules that never import each other, and entitlement as the switch still hold. "Every module in one image" does not; every customer's image contains only that customer's modules (DEC-33).
date: 2026-09-16
---

# One application image with every module compiled in

Modules are customer-specific today because the team does not yet have the experience and data to make them reusable, and the long-term vision is that modules become reusable across customers. We decided that all modules compile into one application image and that a tenant sees a module only when it holds an entitlement in the control plane. There is one application, `apps/genie`, and no application folder per customer.

## Considered options

1. One thin application per customer that imports only that customer's modules. Keeps a customer's module code out of other customers' images. Rejected because it multiplies build, deployment, and upgrade work per customer. Confidentiality is met instead by a per-customer image from the same application and the same Dockerfile (DEC-33).
2. One image, entitlements per tenant. Chosen. A module becomes reusable by granting a second tenant the entitlement. Nothing moves.

## Consequences

- The module registry checks the tenant's entitlement before mounting a module's routes, navigation, and routers. A module without an entitlement is invisible and its routes refuse on the server.
- Every module owns its own migration history and its own migrations table, and core owns another. In the shared image every tenant database receives every module's tables, whether or not the tenant is entitled; empty tables are the accepted cost. A per-customer image applies only the histories of the modules it contains (DEC-33).
- Modules never import each other. Core references module records only by text scope pairs, never by foreign key.
- All code is owned by Genie Ops Center and lives in the one monorepo; there are no customer repositories (DEC-22). A customer-hosted deployment runs a per-customer image built from the same monorepo and the same Dockerfile with a build-time module include list; the module registry file is generated from that list, so an excluded module is absent from the image, the client bundle, and the migration history (DEC-33). A customer who needs an entirely different experience gets an app under `customers/<slug>/app/` that composes the same core, ui, and modules; "one image" then means one image per app, and the standard image serves every other tenant.

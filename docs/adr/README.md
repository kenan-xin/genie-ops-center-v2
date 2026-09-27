# Architecture decisions

Accepted architectural choices and their trade-offs live here. Product behavior and configuration decisions live in [the core decision log](../core/decision-log.md), indexed by [product vision](../core/vision.md). Specifications derive requirements from these sources; architectural decisions do not depend on specifications or implementation tickets.

| Record | Decision |
| --- | --- |
| [0001](0001-database-per-tenant.md) | Database per tenant; amended by 0007 |
| [0002](0002-keycloak-realm-per-tenant.md) | Keycloak realm per tenant; amended by 0010 |
| [0003](0003-one-image-all-modules.md) | Original image model; amended by 0007 |
| [0004](0004-authorization-in-application.md) | Application-owned authorization |
| [0005](0005-tenant-migrations-at-deploy.md) | Migration lifecycle; amended by 0007 |
| [0006](0006-keycloak-and-better-auth-split.md) | Identity/session split |
| [0007](0007-one-deployment-per-customer.md) | Separate deployment and selected-module image per customer |
| [0008](0008-foundation-integration-and-generated-registry.md) | Native-first integration, generated registry and minimal Storybook host |
| [0009](0009-storybook-pins-the-vitest-major.md) | Storybook-compatible Vitest major |
| [0010](0010-client-only-mode-in-an-existing-realm.md) | Client-only mode in a customer's existing realm |

Preserve superseded reasoning with an explicit amendment and current authority. Acceptance of a decision is distinct from proof that its implementation passes.

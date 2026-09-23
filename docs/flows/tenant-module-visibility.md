# Tenant module visibility

## CF-TMV-01 — A tenant receives only its own modules and shared core

Status: canonical product requirement, explicitly reaffirmed by the owner on 2026-09-20. Implementation proof is separate and is not established by this document. Package naming, folder layout, tooling and refactoring must preserve this behavior; changing it requires an explicit product decision.

As a person using my tenant's Genie Ops Center deployment, I want access to the shared core functionality and the modules supplied to my tenant, subject to my permissions, without exposure to another tenant's excluded modules or data.

Starting conditions: the customer deployment has a selected module set; the tenant's module enablement and the person's permissions are evaluated independently.

1. The operator builds the customer's image with its selected modules and shared core. Excluded modules are absent from the image, not merely hidden in navigation.
2. On sign-in, the application presents the core functions the person may use and the enabled module entries their permissions allow.
3. Direct navigation and API calls enforce the same availability and authorization rules. Hiding a link is not an access control.
4. Tenant data remains isolated. Inclusion of a capability in two customer deployments never grants either customer access to the other's data.

An included but disabled module does not allow ordinary module use. Its data/grants remain retained under the existing lifecycle contract; authorized core administration may still show its status and permitted pre-enable configuration. Shared core is not blanket administrator access. No available module grants leads to the specified no-grants state, not access to another tenant's modules. Adding a package prefix must not alter module IDs, permission keys or customer include lists.

## Traceability and required proof

| Contract | Source and acceptance |
| --- | --- |
| Selected customer images and excluded-module absence | [Spec 0](../specs/00-monorepo-foundation.md), R-21/R-22, AC-5/AC-17/AC-24; prove at the build input that the image holds only the selected modules, then inspect routes, tables and migration files, including cached builds with different selections |
| Tenant data isolation | Spec 0 R-17–R-20, AC-4; real two-context database isolation tests |
| Permission-filtered shell and no-grants state | [Spec 3](../specs/03-shell-branding-and-design-system.md), R-28/R-30; runtime and E2E authorization/navigation proof |
| Authorization and disabled-module behavior | [Access model](../architecture/access-model.md), [Spec 2](../specs/02-identity-and-access.md), [module lifecycle stories](module-access-upgrades.md) |
| Administrative exceptions without granting use | [Categories and Settings](categories-and-settings.md); disabled-module settings retain their explicit core/additional permissions |

Preserve the existing permission and lifecycle acceptance matrices. Component stories alone do not prove server authorization, image exclusion or tenant isolation. This story introduces no new module entitlement or core administrator bypass.

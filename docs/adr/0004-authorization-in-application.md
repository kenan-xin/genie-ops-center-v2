---
status: accepted
date: 2026-09-16
---

# Authorization in the application as scoped roles

Customers bring different permission models: by department, by office, by role, by record. We decided that the application authorizes, Keycloak only authenticates and supplies groups, and the model is scoped role-based access: a `role` is a named set of permission keys declared by modules, a `role_assignment` binds a role to a user or a group at an optional scope, and one function, `can(user, permission, resource?)`, is the only check.

## Considered options

1. Keycloak authorization services. Rejected because module-owned records (a chat solution, a document in a customer module) would have to be mirrored into Keycloak, and every check would be a network call.
2. An attribute-based policy language or an external policy engine. Rejected for the foundation because no known customer requirement needs it and it is hard to reason about.
3. A relationship-based engine such as OpenFGA or SpiceDB. Rejected for the foundation because scoped roles cover the known cases with three tables. Kept as the upgrade path behind the `can()` seam.
4. Scoped roles in the application. Chosen.

## Consequences

- Group membership is sourced from the customer's identity provider through a normalized groups claim in Keycloak, so administrators assign roles to groups and rarely to people.
- Per-user grants exist only as `role_assignment` rows with a user principal. No module may implement its own permission check.
- If a customer's model outgrows scoped roles, the change is inside `can()` and its tables, not in the modules.

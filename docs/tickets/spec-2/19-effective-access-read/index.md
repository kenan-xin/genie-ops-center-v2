# S2-19: Effective access read for one recipient

Bead: `d8l5.29`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-37d (A8), R-37e, R-32 and R-39.
- [Data shape](../../../architecture/data-shape.md), `role_assignment` and `group_member`.
- [Access model](../../../architecture/access-model.md).
- [Technical plan](../../../tech-plans/02-identity-and-access.md), D2-6.
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: S2-18. S2-21 and S2-22 depend on it.

## Scope

1. One server read in the roles router, behind `core:roles:manage`. For one recipient, it returns the direct assignments and the assignments of the recipient's groups.
2. Each row carries the role, its module, the scope, the path (direct, or the group), and the person who added it (`role_assignment.created_by_user_id`).
3. Each row carries the facts that make it "not in effect": an archived group, a disabled person, or a switched-off module.
4. Paged by subject for Overview. Unpaged for the one recipient of Grants.
5. The read excludes the break-glass account. Groups do not nest, so a person expands through their own groups only.
6. No new table, no new permission key, no write. `can()` and `scopesFor()` stay the only access checks.

## Acceptance

Integration tests against a real Postgres: a person who reaches one module through two groups returns both paths, and a removed or archived group is not shown as in effect. A caller without `core:roles:manage` is refused. The break-glass account never appears. The shared definition of done in the [index](../README.md) also applies.

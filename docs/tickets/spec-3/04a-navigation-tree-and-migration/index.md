# S3-04a: Section 3 migration, navigation tree and page stubs

Bead: `6wz1.6`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-03](../03-primitives-and-shared-parts/index.md).

Beads folded into this ticket: none. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-28, R-29, R-29a, R-30, R-34, R-86a, and the tree half of R-91. Plan D3-6.

- The R-86a migration: `category`, `user_preference`, and the foreign key from `tenant_module.category_id` with orphans set to null. This is the only Section 3 migration.
- The R-29 contract change: remove `categoryId` from `lib/module-contract/module.ts` and `validate.ts`, and from the placeholder module and its test.
- The navigation tree builder from entitlements, `can()` and category rows, static entries only (R-28, R-29, R-29a). A dead category id reads as none (R-91).
- The landing route reuses `landingRoute` (R-30). The no-grants empty state (R-34).
- Shared stubs for S3-05, S3-06 and S3-07, before they start (D3-6): all ten R-90a audit keys in `packages/core/src/services/audit/actions.ts`, the four router keys with empty routers in `apps/genie/src/rpc/router.ts`, the four admin navigation entries, and an `issues` field on `AppError` in `packages/core/src/lib/errors/index.ts`.

## Acceptance

AC-11a. The tree parts of AC-4, proven by unit and integration tests and by one end-to-end run: the person lands on the landing route, a registry unit test fails a build with two landing flags, a disabled landing module opens the empty state, and a category set through the end-to-end seed moves its static entry and keeps the landing flag.

The shared definition of done in the [index](../README.md) also applies.

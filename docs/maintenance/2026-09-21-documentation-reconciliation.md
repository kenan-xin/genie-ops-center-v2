# Documentation reconciliation — 2026-09-21

Documentation-only reconciliation against accepted decisions, integration records, current Git history and Beads. Baseline: develop `ae00f6b`. No implementation tests were rerun and no source acceptance was inferred from this cleanup. Live execution status and claims remain in Beads; this is a dated reconciliation record.

## Current sources for coding agents

| Subject | Repository authority or evidence | Disposition |
| --- | --- | --- |
| Product intent and decisions | [Vision](../core/vision.md), [decision log](../core/decision-log.md), [ADR index](../adr/README.md) | Upstream sources do not refer to specs, plans or tickets; downstream documents carry traceability |
| Branding setup | [Branding seed requirements](../architecture/branding-seed.md), DEC-35 | Required identity/locale/time zone, deferred reply-to, optional assets/links, notice validation, appearance and text/format defaults approved; explicit null, materialization, precise fallback and email readiness remain open |
| Tenant module visibility | [Canonical story](../flows/tenant-module-visibility.md) | Unchanged: own included modules and core, subject to enablement/permissions and tenant isolation |
| Module naming | [Repository layout](../architecture/repository-layout.md#module-package-naming), [rework map](../tech-plans/module-naming-revision.md) | Capability folders and IDs unchanged; singular package prefix; accepted enforcement distinguished from later consumer proof |
| Activation and permission evolution | [Module-access flows](../flows/module-access-upgrades.md), [permission evolution](../architecture/permission-evolution.md) | Existing approved policies retained; upgrades do not silently enable newly introduced modules or expand ordinary-role authority |
| Removal/reintroduction | [Removal contract](../architecture/module-removal.md) | Disable, remove code and delete data remain distinct; controlled removal/runtime mechanisms remain gated |
| Categories and settings | [Module contract](../architecture/module-contract.md), [business flows](../flows/categories-and-settings.md) | Accepted B4/B5 retained; other design choices not promoted to approved requirements |
| S0-01 | [Integrated acceptance](../tickets/spec-0/01-workspace-and-build-inputs/integrated-acceptance.md) | Accepted cb5b010; historical branch evidence kept separate |
| S0-02/G1 | [Integrated acceptance](../tickets/spec-0/02-storybook-compatibility-g1/integrated-acceptance.md) | Accepted ae00f6b, including compatibility and cache fix; broader confidentiality/runtime proof remains separate |
| Dependency upgrades | [Upgrade/removal contract](../architecture/storybook-dependency-upgrades.md) | Stable bridge adopted; alpha experiment remains unapproved; serving is an overridable loopback default |
| S0-03 | [Continuation](../tickets/spec-0/03-module-contracts-and-build-safe-schemas/continuation.md), [remaining work](../tickets/spec-0/03-module-contracts-and-build-safe-schemas/remaining-work.md) | Owner delivered continuation through reviewed local integration; Beads still in progress at reconciliation; verify writer transfer before shared edits |
| Workflow | [Ticket execution contract](../tickets/spec-0/README.md) | Explicit per-ticket grants override generic holds; routine Beads sync allowed; code pushes and hook activation remain separately controlled |
| Imported design | [Import record](../design/imports/2026-09-19-latest.md), [review summary](../design/history/2026-09-19-sync-review.md) | Portable evidence and hash manifest; reference captures do not prove production behavior or revision freshness |

## Preservation and limits

Historical reviews and branch evidence retain the revisions and outcomes they actually tested, with current-status pointers where needed. No experimental compatibility alternative, rejected naming proposal or unresolved design recommendation was promoted into product requirements. The source-of-truth cleanup report and drafting readiness report remain dated historical records.

No source files, owners, gate closures, pins or tenant-visibility rules changed. S0-03's older branch documentation must be reconciled with these requirements rather than overwriting them on integration. Uncommitted documentation must be preserved; publishing the documentation baseline remains distinct from recording these decisions.

Verification: changed-document relative file links, upstream/downstream reference direction, absence of external coordinator references, and whitespace checked. Repository formatter check passed for its matched files; ignored Markdown is not claimed formatted by that command. Current code tests were not needed for this documentation-only change.

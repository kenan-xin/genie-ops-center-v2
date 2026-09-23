# Specifications

One specification per core roadmap section, named `NN-<section>.md`. A specification is written before implementation and approved by the product owner before its tickets are written in `../tickets/`. Nothing in this folder is self-approved. `SPEC_READINESS_REPORT.md` is the evidence and findings report of the specification round: the inventory, the fixes made to other documents, the deferred decisions, and the validation performed.

## Index

| File | Roadmap section | Status | Confidence |
| --- | --- | --- | --- |
| `00-monorepo-foundation.md` | Section 0: Monorepo foundation | Approved for ticket breakdown, 2026-09-19 | 8.2 |
| `01-deployment-and-setup.md` | Section 1: Deployment and setup | Approved for ticket breakdown, 2026-09-23 | 8.4 |
| `02-identity-and-access.md` | Section 2: Identity and access | Draft, awaiting approval | 8.5 |
| `03-shell-branding-and-design-system.md` | Section 3: Shell, branding, and design system | Draft, awaiting approval | 8.1 |
| `04-solutions-module.md` | Section 4: Solutions module | Draft, awaiting approval | 8.0 |
| `05-operations.md` | Section 5: Operations | Draft, awaiting approval | 8.4 |

Customer modules (contracts, approvals) have no specification here. They are deferred on customer discovery (`../modules/README.md`) and get a specification per module phase when their discovery closes.

## Dependencies

The [Spec 0 technical plan](../tech-plans/00-monorepo-foundation.md) sequences accepted foundation choices and early verification gates. [ADR 0008](../adr/0008-foundation-integration-and-generated-registry.md) records native-first integration, minimal Storybook wiring and generated-registry ownership. Spec 0 and its technical plan were approved for ticket breakdown on 2026-09-19; the [ticket map](../tickets/spec-0/README.md) preserves G1/G2 as blockers. Approval is not implementation evidence and does not approve Sections 1–5.

Business walkthroughs live in [Core flows](../flows/README.md). Specifications remain the source of numbered requirements and acceptance criteria; flows explain user intent and observable outcomes. Link relevant scenario IDs in both directions when adding or changing behavior, and identify design gaps and unresolved branches explicitly. [Module activation and permission upgrades](../flows/module-access-upgrades.md) maps CF-MA-01–09 to Sections 1–4. These are business scenarios, not Storybook stories or implementation tickets.

Permission and default-role upgrades in all sections and future modules follow [Permission and system-role evolution](../architecture/permission-evolution.md), accepted 2026-09-18. Section 2 R-33a–R-33c/AC-25 own evaluator and upgrade proof. Sections 0–1 must preserve that path without implementing real authorization before Section 2; Section 4 and future modules use the shared policy rather than module-specific seeding behavior. Removal/reintroduction follows the accepted [module removal policy](../architecture/module-removal.md) and CF-MA-10–12. Sections 1–5 specify startup refusal, retained access, reviewed reactivation and operator lifecycle proof. Until controlled removal is implemented and tested, reject omission of installed modules; fresh-image exclusions remain supported. Reconciliation ownership and the policy's listed implementation mechanisms remain open.

### Shared UI development gate

Section 0 supplies the Storybook harness and component-test layer (R-41a–R-41d, AC-27/AC-28). Every later section that introduces or changes UI must use [the shared story-first TDD workflow](../architecture/ui-development.md): colocated documentation/states, applicable interaction/accessibility tests, and focused unit tests before app consumption. This applies to deployment/setup screens, identity, core administration, shell/primitives, Solutions, and future capability modules. No UI implementation is pulled forward solely to populate Storybook. Integration and deployment E2E requirements remain independent; story mocks are not proof of authorization or server behavior.

From `../core/roadmap.md`, "Order and parallelism". Sections 0, 1, and 2 are sequential. Section 3 starts when Section 1 is done; its items 1, 2, 3, 6, 8, and 9 run beside Section 2, and its items 4, 5, 7, 10, and 11 need the access seam and the account page from Section 2. Section 4 starts when Sections 2 and 3 are done. Section 5 runs beside the others from Section 1 onward. A specification names the earlier section it depends on and the later section that finishes what it only declares.

## Common format

Every specification starts with these three lines and ends with the two closing sections. The score is honest: it says how likely the specification is to be implemented without rework, and a low score is useful information.

```
Confidence: X.X/10
Reasoning: supporting evidence, remaining uncertainty, and implementation-risk factors, in two to four sentences.
Status: Draft — awaiting user approval
```

Body sections, in this order. A section that does not apply says "None." rather than being omitted.

1. Goal and scope. What the section delivers, what it excludes, and the boundary with the sections before and after it.
2. Sources. The roadmap items, decisions (`DEC-n`), ADRs, architecture contracts, module documents, and design files this specification is built from. Requirements below cite these by path and by stable heading or decision id.
3. Requirements. Observable behavior, data ownership, interfaces, and state transitions. Authorization, lifecycle and readiness gates, failure handling, and recovery. Security, configuration, migration, compatibility, and operational rules where they apply. Each requirement is a numbered `R-n` so tickets and tests can point at it. A requirement marked `Proposal` is not yet decided and is listed again under Open questions.
4. Acceptance criteria. One numbered `AC-n` per roadmap work item and one per clause of the definition of done, each testable, each naming the requirements it proves.
5. Verification. The evidence required: unit tests, integration tests against a real Postgres through Testcontainers, and end-to-end tests at a phone viewport and a desktop viewport (`DEC-25`), plus manual checks where no automated layer fits.
6. Deferred. What this section declares but a later section implements, what is intentionally later, and the trigger that reopens each item.

```
Assumptions
- The assumption, the evidence or rationale, and the consequence if it is wrong. Or "None."

Open questions
- The canonical question or decision reference, the behavior it affects, and whether it blocks implementation. Or "None."
```

Rules that every specification follows:

- Writing rules of `../README.md`: no customer name, no reference to a previous codebase, "identity provider" unless a vendor is the specific example, a module named by its capability, and "Genie Ops Center" for the product.
- A specification cites a canonical document for a definition instead of restating it. Module domain definitions stay in `../modules/<module>/`. Design files own presentation and cite the platform documents for behavior.
- A specification never changes a decision. A contradiction with a recorded decision is a finding for `SPEC_READINESS_REPORT.md`, fixed there when the resolution is unambiguous, or recorded as an open question under its canonical id (`OPEN-n` in `../core/vision.md`, a module `OPEN-n`, or a customer `D-n`).
- Every `Revisit`, `Guard`, `Designed in`, and `Implemented` distinction in `../core/decision-log.md` is preserved. A seam that a `Revisit` line depends on is never removed.

## Review-change compatibility gate

Before accepting a specification correction, trace its producers and consumers across all six specs, the canonical architecture/module contracts, roadmap, vision, `../../PRODUCT.md`, and `../../DESIGN.md`. Read the affected decisions' `Revisit` and `Guard` clauses. Record which later sections are affected, what remains deferred, and the tests that preserve their paths; update affected contracts and specs together. A local fix must not silently introduce an earlier dependency, close a deferred extension seam, or change product/design intent. Unresolved conflicts return to the product owner before tickets or implementation. Document consistency and executable feasibility are separate evidence; do not report an unrun integration as proven.

## Design alignment acceptance gate

Before approving a specification with user-facing behavior, map each relevant requirement and acceptance criterion to the current design under `../design/`: screen/entry point, permission or role involved, scope, action, resulting state, and its verification evidence. Review the happy path and applicable empty, denied, disabled, loading, error, and destructive-confirmation states at phone and desktop sizes. Include cross-screen handoffs; a control described in prose without a usable destination or matching input contract is not covered. Record missing designs and spec/design contradictions as approval findings rather than inventing behavior during implementation.

An interactive prototype may supply review evidence but is not canonical design approval or proof of backend enforcement. Record the product owner's approval before treating proposed interactions as settled, and update affected design specs, types, sample data/reference components, and implementation specs together when a change is accepted. Non-UI requirements may be marked not applicable with a reason; later-section screens remain owned by their sections, not pulled into Section 0.

## Accepted Categories and Settings decisions (2026-09-19)

B4 and B5 from the design handoff are accepted, not open product questions. One Categories page assigns both whole modules and contributed records through module-owned providers. Settings uses Navigator A, metadata-only fuzzy search, and `core:settings:manage` AND any additional section permission. Disabled compiled configuration remains editable without enabling; excluded modules are absent. Normative details live in the module contract's Category assignment boundary and Settings discovery and authorization; business examples live in [Categories and Settings flows](../flows/categories-and-settings.md).

Section 0 R-56/AC-29 declares/tests these interfaces and generator coverage only. Section 3 R-75a/R-91a/AC-19 provides runtime UI, authorization and dispatch; Section 4 R-37a/AC-13a supplies Solutions. Section 4 needs no new category capability in core. No database tables or transport endpoints are prescribed by these decisions. B1–B3 and B6–B8 are not resolved here. Specs remain drafts; accepted decisions do not approve the whole specification. The design source and imported snapshot must be checked against these boundaries at the next coherent import, not silently treated as updated by this documentation change.

## Section boundaries

What each section defines and what a later section implements, settled before drafting so the six specifications agree.

| Boundary | Where it is defined | Where it is finished |
| --- | --- | --- |
| `TenantContext` | Section 0: `createTenantContext()`, the fixed members (pool, environment values including the validated chat origin allow-list), the type, and the isolation test | Section 1 adds the file store and the settings, branding, and entitlement readers (`DEC-46`); Section 2 item 1 adds the Better Auth instance |
| Build/startup lifecycle | Section 0 R-19a/R-19b/AC-26: secret-free build with no deployment-service access; explicit runtime initialization and migration gate | Section 1 adds separate worker/CLI contexts and pre-setup serving; Section 2 adds runtime auth and step-scoped realm credentials; Section 3 keeps branding request-bound; Section 4 keeps provider/entitlement reads runtime-owned; Section 5 delivers the same built image with runtime configuration |
| `can()` and `scopesFor()` | Section 0: the signatures, the per-request loader shape (`DEC-48`), and the stub that grants only `placeholder:read` | Section 2 item 6 replaces the stub with the real evaluator; Section 4 proves record scopes end to end |
| Module contract | Section 0: the type of every point in `../architecture/module-contract.md`, and the placeholder module exercising identity, schema, router, permission keys, record types, default roles (declared), navigation (declared), pages, configuration schema (declared, contract test for the five field kinds), content security policy origins, and tests | Section 1 delivers events, capabilities, jobs, integrations, and entitlement; Section 2 seeds default roles and filters navigation by permission; Section 3 renders `ConfigForm` and the shell tree |
| Module registry | Section 0: generated from `MODULE_INCLUDE`, mounts routers, renders declared navigation with no filter | Section 1 item 1 adds the entitlement filter; Section 2 item 6 adds the permission filter |
| Migrator | Section 0 item 5: advisory lock, `LOCK_TIMEOUT_MS`, core then modules, unhealthy on failure | Section 1 item 4 adds `genie-ops migrate`, the pending count, Squawk and `drizzle-kit check` in the pull request pipeline (`DEC-43`) |
| Deployment tables | Section 1 item 1 creates them with nullable user columns and `tenant_module.category_id` without a foreign key | Section 2 adds the foreign keys to `user` in the migration that creates it; Section 3 creates `category` and `user_preference` and adds the `category_id` foreign key |
| `genie-ops` | Section 1 item 10: the runner, the audit helper (`DEC-45`), `setup` (migrations and seed steps), `module enable|disable`, `migrate`, `retire` | Section 2 item 9a: `idp set`, `admin add`, `break-glass rotate`, and the realm, clients, roles, admin seed, and break-glass steps of `setup` |
| Not-set-up page | Section 1 item 2: shown until every `setup_step` the running image knows is done | Section 2 adds steps; a stack set up earlier runs them on its next `genie-ops setup` |
| Security headers | Section 0 item 11 covers document and non-document responses; only iframe-viewer documents invoke an origin provider | Section 2 extends sign-in coverage; Section 3 proves ordinary shell zero-lookups and full-document entry to the placeholder viewer; Section 4 proves the real embedded viewer and zero lookups on chat/stream and other non-viewer paths |
| Navigation tree | Section 0 declares `{ pinned, entries }` with `categoryId` and the landing-route flag (`DEC-49`, `DEC-51`) | Section 3 item 4 renders it and item 11 manages `category`; Section 4 item 1 supplies the solutions entries |
| Streaming route pattern | Section 4 item 3 provides it in core | First and only consumer is the solutions module |
| Hosting and automation | Section 1 and `../runbooks/deployment.md` fix the manual path (`DEC-38`) | Section 5 writes the runbooks; the automation tool is `OPEN-7` and is not chosen by any specification |

## Cross-section calls made in the drafting round

Each call below follows an existing decision or convention and was made by the coordinator so the six drafts agree. None is a new decision. Each is listed in `SPEC_READINESS_REPORT.md` for the product owner to confirm or overturn at approval.

| Call | Reading | Evidence |
| --- | --- | --- |
| Health endpoint | `GET /api/health`, unauthenticated, body `ok` or `degraded` and nothing else. Section 0 returns `ok`; Section 1 adds `degraded` on the same path. | `../architecture/repository-layout.md` (`src/app/api/` holds health); roadmap Section 1 items 2 and 4; `DEC-9` |
| Image push on release tag | Section 0 item 8 builds one image per customer folder and pushes it; Section 5 owns the per-customer read token, package access, the release file, and the runbooks. | Roadmap Section 0 items 5 and 8 both say the script pushes; `DEC-33` "Implemented" names the push in Section 5, which this reading narrows to the customer-facing delivery |
| Section 0 smoke test | Two container-level cases against fresh disposable Postgres databases: development/CI images prove startup, included histories, health, and the placeholder page with security headers; customer images prove startup, included histories, health with security headers, and absence of excluded routes, tables, and image migration files, including the placeholder. Customer images with an explicit empty module list must pass. Section 1 item 6 runs the applicable case through generated compose and adds setup-state checks. | Roadmap Section 0 item 8; Spec 0 R-15, R-22, R-53; two cases approved by the product owner during the Spec 0 review |
| Release-tag matrix before any customer exists | An empty customer matrix plus the default all-modules image. | Roadmap Section 0 item 8; `MODULE_INCLUDE` default in `../architecture/environment-contract.md` |
| `genie-ops retire` | The command, the `retirement` row, and the refusal rules land in Section 1 item 10; `--confirm` deletion after the hold, the deletion hold, and personal erasure land in Section 5 item 7. | Roadmap Section 1 item 10 and Section 5 item 7; `DEC-17` "Implemented: Section 5" |
| Setup steps across releases | Section 1 defines the known-step list; Section 2 lengthens the same list. The not-set-up page shows while any step the running image knows is not done. | Roadmap Section 1 items 2 and 5; `../runbooks/deployment.md` Upgrade step 5 |
| Nullable user columns | All six Section 1 columns that reference `user.id` are nullable until the Section 2 migration adds the foreign keys. | `../architecture/data-shape.md` rule 7 |
| Module admin key | `<id>:admin` is the key `DEC-23` appends to `Tenant administrator` on enable and removes on disable. | `../architecture/module-contract.md` Permission keys row; `solutions:admin` in `../modules/solutions/README.md` |
| `groups` claim form | Bare group names, not full paths (`full.path` false on the Group Membership mapper). `group.external_id` holds the name the provider sent. | `../architecture/access-model.md` ("a list of group names"); `../runbooks/keycloak-realm.md` |
| Sign-out | The sign-out path reads the stored id token once for `id_token_hint`. | Roadmap Section 2 item 1 as corrected; `DEC-11` |
| Landing route | At most one entry across all compiled modules may carry the landing-route flag; zero is valid, and the registry fails the build on two. Section 0 proves this with synthetic fixtures and an unflagged placeholder, not solutions. Section 3 implements selection and the no-grants fallback when no entitled, reachable landing entry exists. Section 4 supplies the solutions hub's landing entry. | `DEC-49`; roadmap Section 3 item 4; Section 0 R-23a/AC-5 and Section 4 R-8 |
| Hub entry placement | With no category the solutions hub entry sits in the WORKSPACE block; with a category it renders under that heading. The landing-route flag is independent of placement. | `DEC-50`; `../design/shell/spec.md` Navigation Structure |
| Idle-timeout seam | Section 2 owns the per-request check and the throttled slide and exposes the session's idle expiry time to the client; Section 3 schedules the warning from that value so "Stay signed in" always lands inside the window. | Roadmap Section 2 item 4; `DEC-46` |
| Fonts | All four approved families are self-hosted in the image, because the list grows only by a pull request that adds the font files. | `../architecture/data-shape.md` Branding, `font_family` |
| `configSchema` is optional | A module may declare none; Tenant Settings then renders no section or search entries. Compiled disabled schemas remain configurable under the accepted core permission boundary. | `DEC-30`; `../architecture/module-contract.md`, Settings discovery and authorization |
| Error response body | Ordinary HTTP routes return `{ code, message, requestId }`. tRPC preserves its standard envelope and protocol codes, with the application code in `data.appCode`, the request id in `data.requestId`, and the safe message in the standard message field. Both use one core catalogue that later sections and modules extend; module codes are `<id>:<code>`. Request ids match pino logs. Neither transport exposes raw exception text, causes, or stack traces. No custom tRPC transport is required. | `DEC-31`; roadmap Section 0 item 10; transport distinction approved by the product owner during the Spec 0 review, R-46 |
| SMTP client | The SMTP mailer adapter is built on Nodemailer, added to `../core/tech-stack.md` with its reason. | Roadmap Section 1 item 8; `../core/tech-stack.md` Communication |
| Setup step order | `migrations`, `seed`, `realm`, `clients`, `roles`, `admin_seed`, `break_glass`. The `seed` step inserts the `tenant_module` rows before `roles` seeds default roles, and it is their only writer until it is `done`. After that the migrator run registers a newly compiled module disabled (`DEC-50`). | `../architecture/data-shape.md` `setup_step`; roadmap Section 1 item 5 |
| Disabled module | A compiled module whose entitlement is off stays mounted and every one of its routes and procedures refuses; an excluded module's routes do not exist. The smoke test tells the two apart. | Roadmap Section 4 item 4; ADR 0003 |
| `genie-ops retire` | The command records the date; the operator stops the stack. | Roadmap Section 5 item 7 as corrected; `DEC-17` |
| Account page roles summary | Section 2 item 4 builds the account page including its roles summary; Section 3 item 7 adds only language, time zone, and theme. | Roadmap Section 2 item 4 and Section 3 item 7 |
| Permission-gated route | A screen the person may not open is hidden from navigation and its route refuses on the server; it is not unmounted. | `DEC-39`; roadmap Section 2 item 6 |
| Realm session settings | The realm's SSO idle and maximum lifetimes are fixed template values equal to the `DEC-46` defaults (15 minutes idle, 24 hours maximum) and are independent of the tenant's idle setting, which the application enforces per request. | `DEC-46`; `../runbooks/keycloak-realm.md` |
| Tenant generator files | The generator always writes the seven files of `../architecture/repository-layout.md`, `values.yaml` included. | `../architecture/repository-layout.md`; roadmap Section 1 item 6 |

## Terminology

- Tenant: the one customer of a deployment (ADR 0007). Never a row, never a column.
- Person: how a `user` row is shown in every screen. Member: a signed-in person in the workspace. Tenant administrator: a person holding the `Tenant administrator` system role.
- Admin portal and workspace: the two chromes of the one shell. Operator: whoever runs the host in the chosen hosting mode.
- Module, entitlement, compiled module: a module is a package under `packages/modules/<capability>`; compiled means present in the image; the entitlement is `tenant_module.enabled`.
- Placeholder module: the module that exercises the contract in tests and is never compiled into a customer image.

## Review status

| Date | Round | Result |
| --- | --- | --- |
| 2026-09-18 | Drafting round: six specifications, common format, readiness report, realm runbook | Drafts complete after one integration pass, one mechanical check, and one independent cross-specification review (13 findings, all closed). |
| 2026-09-18 | Decisions round with the product owner, then a Codex review of the working tree | All eleven deferred decisions settled and recorded in their canonical documents; five review findings fixed. No specification has an open question. The reverse proxy runbook added. Awaiting the product owner's approval of the six drafts. |
| 2026-09-23 | Spec 1 approval by the product owner | `01-deployment-and-setup.md` approved for ticket breakdown, with Nodemailer confirmed as the SMTP client and the DEC-50 registration owner decided. Specs 2 to 5 remain drafts. |

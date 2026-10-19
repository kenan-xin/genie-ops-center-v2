---
status: proposed
date: 2026-10-19
amends: DEC-39 (scopes gain a relation kind), module contract Record types row, docs/modules/approvals and docs/modules/contracts provisional shapes
---

# Approvals as a reusable workflow module, contracts as its first consumer, and relation scopes in `can()`

The first customer's product is a legal agreement approval flow. Its own design builds that flow on a general workflow builder: workflow definitions with versions, five step kinds (start, approval, condition, outbound HTTP call, end), one form per workflow, configurable statuses, backups, leave and delegation. Its design notes say the same engine will run the customer's next flows and other customers' flows. The owner wants Ops Center to work as a company portal: every published flow, such as Agreement review or IT access request, appears in the sidebar for the people allowed to use it, and each flow keeps its own approvers inside.

This record settles three questions. Where does the workflow engine live? How does a published flow become a sidebar entry that an administrator grants per person or group? How can a person see a case because of their relation to it, for example as the requester or the current approver, when `DEC-39` forbids any access check outside `can()` and `scopesFor()`?

A throwaway logic prototype shows the result. It lives on the branch `chore/prototype-workflow-builder`, in `docs/modules/approvals/PROTOTYPE-workflow-builder.html`.

## Considered options

Where the engine lives:

1. Inside one customer module that holds both the engine and the legal flow. Rejected: a second flow, such as an IT access request, would need a second copy of the engine or an import between modules, which the module rules forbid.
2. In core. Rejected: the vision lists "a general workflow engine before a module needs one" as a non-goal, the approvals README says core must not build one, and core must not grow from one module's needs.
3. A reusable `approvals` module that holds the engine and the builder, a `contracts` module that holds the register, and the customer's flows as data. Chosen.

How a person sees a case:

1. The module checks relations itself. Rejected: it breaks `DEC-39` and the module contract rule "no permission check elsewhere".
2. The module writes one `role_assignment` row per case and person when a step is assigned. Rejected: core is the only writer of `role_assignment` (`DEC-39`, `DEC-50`), the rows grow with every case, and leave and delegation would need rows written and removed on a schedule.
3. A new scope kind, the relation scope, answered by the module that owns the record type. Chosen.

## Decision

### 1. The module split

- `approvals` is a capability module. It owns workflow definitions and their versions, the builder screens, the five step kinds, one form per workflow, cases and their history, configurable statuses, and backups, leave and delegation. It knows no business domain. A case runs on the definition version it started on.
- `contracts` is a capability module. It owns the agreement register, register numbers, signing records, import and export. It never imports `approvals`.
- When a case ends, `approvals` publishes the event `approvals.case.finished`, version 1, with the workflow id, its tags, the case id and the form values. Because `contracts` subscribes, the event's name, version and zod schema live in `packages/core/contracts` (`DEC-42`). `contracts` acts only on workflows tagged `contract`.
- A customer's flows are data, drawn in the builder or imported from an export file. The legal agreement flow and an IT access request are two definitions of the same module, and adding a third needs no code.
- Outbound HTTP steps name a connection that holds a `tenant_integration.secret_ref`. The secret stays in the environment, and the module never stores or sees it. This record does not decide whether an administrator may type a secret in the builder later; that stays open.

### 2. Workflow-scoped roles and the sidebar

- `approvals` declares a record type `workflow`. A role carrying `approvals:use` scoped to `workflow:<id>` lets a person or a group start cases of that workflow. A null scope grants every workflow. This is the mechanism Solutions uses for `solution:<id>`, so core gains nothing here.
- The module's navigation tree has one entry for each published workflow the person may use, built per request after `can()`, as the Navigation row of the module contract already allows. An entry may carry a core `categoryId`, so an administrator can group flows under headings such as Legal or IT (`DEC-51`).
- The module also declares a record type `case`, whose parent type is `workflow`. A role carrying `approvals:case:read` scoped to `workflow:<id>` lets, for example, the legal team read every case of the agreement flow, through the parent rule that `can()` already applies.
- Who approves each step is part of the workflow definition, not a role. The builder names a person, the requester, or a backup, and that choice is module data.

### 3. Relation scopes in `can()` and `scopesFor()`

- A record type may declare named relations, for example `participant` for the case type. A relation is a fact about one person and one record that the owning module computes from its own data: the requester, the current approver, a past actor, or a person acting for one of these through backup or delegation.
- A role assignment may carry a relation scope, written `relation:case.participant`, instead of a record id. It means "this permission applies to every record of that type where the person holds that relation".
- `can(user, permission, resource)` matches a relation scope by calling the record type's relation resolver once for that person and record, through `ctx.tenant`. The per-request loader of `DEC-48` caches the answer for the request.
- `scopesFor(user, permission)` returns relation scopes unchanged, as it returns parent scopes today. The module turns each one into its own `WHERE` clause on its own columns, so list pages and totals stay correct (`DEC-39`).
- `approvals` seeds a system role, Case participant, carrying `approvals:case:read` with the scope `relation:case.participant`, assigned to every person. An administrator may narrow or remove it like any system role (`DEC-50`).
- Core still writes `role_assignment` alone, and no module checks access by itself.

## Why

What the decision removes or gains:

- One engine serves every approval flow of every customer, and a new flow is configuration, not code.
- The portal sidebar comes from existing parts: record-scoped roles, the per-request navigation tree, and core categories.
- An administrator grants a flow to a person or a group on the same People and Roles screens as everything else.
- The register stays separate from the engine, so a customer can have approvals without contracts, and contracts can later take records from another source.
- Relation access stays inside the one access seam, so the audit reader, the Access overview and every test keep one place to look.
- Leave and delegation need no role rows written on a timer, because the relation resolver reads the module's own current data.

What the decision costs:

- A new scope kind in core: a contract change to record types, a third branch in `can()`, and a relation clause that each owning module must write correctly in its list queries. A wrong clause leaks or hides cases, so the shared access test suite of `DEC-39` must cover relation scopes.
- One module call per `can()` on a relation scope, cached per request. A page that checks many records calls the resolver once per record.
- A core change shaped by one module's need, which the project normally avoids. The trigger is real now: the first customer's requirements exist and name these behaviors.
- Two customer modules instead of one, with one versioned event between them that must stay compatible.
- The workflow engine becomes the largest module in the repository. Its own background jobs, retries, timeouts and idempotent HTTP calls live in the module, on the core job worker.

## Consequences

- Before `approvals` can ship, the platform needs three things this record does not settle: module pages with nested routes, parameters and server data loading; a typed browser client for module procedures; and an outbound HTTP service in core with an allowed-host list, lifted from the Solutions chat proxy. Each needs its own record or specification.
- The provisional shapes in `docs/modules/approvals/README.md` and `docs/modules/contracts/README.md` change: approvals becomes the reusable engine, and contracts drops its own approval and reminder flow where the engine covers it.
- The discovery questions of both modules are largely answered in the first customer's documents and must be recorded in each module's `discovery.md` before work starts.
- The module contract's Record types row gains relations and a relation resolver, and the placeholder module gains a relation-scoped record type, so core proves the seam without either customer module.

## Open points

- The exact resolver interface, and whether a relation can name a time window, for delegation that ends on a date.
- Whether an administrator may type a connection secret in the builder, against the rule that modules never store credentials.
- Whether the workflow designer role is `approvals:admin` scoped per workflow, or one module-wide key.
- How a customer's flow definitions are versioned in the repository: an export file in `customers/<slug>/`, or data only.

Revisit when a second module needs relation scopes, or when the per-record resolver call shows in a profile. The change then is a relation subquery that `scopesFor()` returns, and callers stay the same.

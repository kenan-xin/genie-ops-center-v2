---
status: proposed
date: 2026-10-20
amends: DEC-39 (a role assignment gains a relation scope), DEC-48 (the loader reads relation rows at one time per request), the module contract rows Record types, Navigation, and Capabilities, docs/modules/approvals and docs/modules/contracts provisional shapes
---

# Approvals as a reusable workflow module, contracts as its first consumer, and core-owned record relations

The first customer's product is a legal agreement approval flow. Its own design builds that flow on a general workflow builder: versioned workflow definitions, five step kinds (start, approval, condition, outbound HTTP call, end), one form per workflow, configurable statuses, backups, leave, and delegation. The same engine is meant to run that customer's later flows and other customers' flows. The owner wants Ops Center to work as a company portal, where every published flow appears in the sidebar for the people allowed to use it.

This record settles five questions. Where does the workflow engine live? Who may see a case, and how do detail checks and list queries give the same answer? How does a published flow become a sidebar entry, and who may start and act on it? How does the agreement register learn about cases? What does core gain, and how does it stay free of module knowledge?

Revision history. Revision 1 (2026-10-19) got the verdict "rework" from an independent critique. Revision 2 (`0711b27`) answered it and got "rework" again from a cross-family review, mainly on the representation of grants, the shared evaluation rule, and the register protocol. Revision 3 (this text) answers that review and records three owner decisions of 2026-10-20: department visibility follows the requester's current department, the workflow's start group decides who starts (the product's rule TD-035), and the agreement register is read by holders of `contracts:read` only. The table "Review findings and answers" at the end maps each finding to its answer. Vision principle 9, "Core knows no module" (proposed on branch `chore/vision-core-knows-no-module`), is the test for every core change here.

A throwaway logic prototype illustrates the portal, on the branch `chore/prototype-workflow-builder`, in `docs/modules/approvals/PROTOTYPE-workflow-builder.html`. Its sidebar and register logic are simulated and decide nothing.

## Considered options

Where the engine lives:

1. One combined module with the engine, the flows, and the agreement register. It can run several flows through one engine. Rejected as the default because a later customer that wants only approval flows would carry legal register code and tables. It stays the fallback: see "When to merge the two modules back".
2. In core. Rejected: the vision lists "a general workflow engine before a module needs one" as a non-goal, and principle 9 forbids core from knowing a module's domain.
3. A reusable `approvals` module with the engine and the builder, a `contracts` module with the register, and each customer's flows as data. Chosen.

How a person sees a case because of their part in it (requester, current approver, past actor, delegate, department):

1. The module checks relations itself behind one broad permission. Rejected: it breaks `DEC-39` and keeps the rule in two places.
2. A relation resolver that core calls per record, with a matching SQL filter written by the module for lists. Rejected: two implementations of one rule can drift, and it costs one call per record.
3. Per-case `role_assignment` rows. Rejected: it mixes administrative grants with facts derived from workflow state, and the table has no validity window or provenance.
4. A core-owned relation table, written by the module in the same transaction as its own change, and evaluated by core with one rule for detail checks and lists. Chosen.
5. A general relationship engine (ADR 0004's upgrade path). Not needed yet. Option 4 keeps that path open.

## Decision

### 1. The module split

- `approvals` owns workflow definitions and versions, the builder, the step kinds, one form per workflow, cases and their history, statuses, and backups, leave, and delegation. It knows no business domain. A case runs on the definition version it started on.
- `contracts` owns the agreement register, register numbers, signing records, amended versions, and import and export. Neither module imports the other.
- A customer's flows are data. A new flow needs no code when the existing step kinds, form fields, and integrations can express it.

| Data | Owner | The other module sees it through |
|---|---|---|
| Case, form values, history, assignees, statuses | `approvals` | The case snapshot event (section 5) |
| Register entry, register number, signing record, concluded date, expiry | `contracts` | Nothing. `approvals` never reads the register. |
| Agreement files | Each module references `file.id` from its own records | Both modules may reference the same file. Each issues a link only after `can()` on its own record (`data-shape.md`, Files). Core must keep a file while any record still references it. Whether the file service already guarantees this is not yet checked. |
| Corrections after registration (amended versions) | `contracts` | Nothing. A correction never reopens a case. |
| Mapping from a flow's form fields to register fields | `contracts` | A versioned mapping per workflow id and form schema version in `contracts` configuration. A `contract` tag on the workflow selects which flows the register reads. |

#### When to merge the two modules back

If building the register shows that `contracts` must write into a running case, must answer inside the completion transaction, or must check case participation to decide who reads a register entry, the two modules merge into one, and this record is amended.

### 2. Who may read what

Owner decisions of 2026-10-20 fix the audiences:

| Record | Who reads it |
|---|---|
| A case, its form values, history, and files | People related to the case (section 3), plus holders of a `workflow:<id>` or tenant-wide `approvals:case-read` grant |
| A register entry and its files | Holders of `contracts:read`, tenant-wide. A person who needs the agreement list gets that permission from an administrator. Case participation grants no register access. |
| Search, reports, exports, and agent reads | The same rule as the records they return, applied in the query before pagination and totals |

### 3. Core-owned record relations

Core gains one generic table and one write API. Neither knows workflows, cases, or contracts.

`record_relation`: id, module_id, record_type, record_id, principal_type (`user` or `group`), principal_id, relation, valid_from, valid_until (nullable), source, acting_for_user_id (nullable), source_revision, created_at. Index on (record_type, record_id) and on (principal_type, principal_id, relation, record_type).

Writes:

- A module declares, per record type it owns, the relation names it writes. Two modules cannot declare the same record type.
- A module writes rows only through `ctx.tenant.relations`, inside the transaction of its own change. Core refuses a write for a record type the module does not own, for an undeclared relation, or with a `source_revision` older than the stored one for that record and relation, so a late repair cannot overwrite a newer change.
- Core writes an audit event for every relation write, with the source.

Grants. A relation grants nothing by itself. It grants through a role assignment with the scope type `relation` and the scope id `<record-type>.<relation>`. Core refuses such an assignment when the relation is not declared, or when the record type does not belong to the module of the role's permissions. A role may be marked relation-only by its module, and core then refuses a tenant-wide or record scope for it, so an administrator cannot turn it into access to every case by accident.

The rows that setup writes, as an explicit and audited administrator action (installing the module assigns nobody):

| Role (seeded by `approvals`, unassigned) | Permission | Assignment principal | Scope |
|---|---|---|---|
| Case participant (relation-only) | `approvals:case-read` | The group the administrator picks, usually all staff | `relation` `case.requester` |
| Case participant | same | same | `relation` `case.assignee` |
| Case participant | same | same | `relation` `case.past-actor` |
| Case participant | same | same | `relation` `case.delegate` |
| Case participant | same | same | `relation` `case.viewer` |
| Department viewer (relation-only) | `approvals:case-read` | The department heads' group or people | `relation` `case.department` |
| Case reader | `approvals:case-read` | For example the legal team | Tenant-wide or `workflow:<id>` |

No assignment of a relation-only role has a null scope. Administrators narrow access by removing assignments. System role definitions stay read-only.

#### The effective-access rule

One rule serves `can()`, `scopesFor()`, list totals, exports, and agent tools:

- Effective principal: the user, plus the groups the user belongs to according to `group_member` in the database, excluding archived groups. Never the session's copy of the groups.
- One time per request, `asOf`, fixed when the request's loader is built. Both `can()` and the SQL filter of `scopesFor()` use it.
- A relation row is valid when `valid_from <= asOf AND (valid_until IS NULL OR asOf < valid_until)`.
- A relation grant applies to a record when a valid row exists for that record and relation, whose principal is the user or one of the user's effective groups, and the user holds a role assignment scoped to that relation.
- Grants combine by union: tenant-wide, record scope, parent scope, and relation scope. A relation applies only to the record it names and never passes to child records. An unknown relation grants nothing.
- Consistency: within one request, memberships and `asOf` are fixed. A relation row committed by another request between two reads of the same request can make those two reads differ. The next request sees one state again, which is the guarantee `DEC-48` already gives for roles.
- A background job or a long action builds a fresh authorization context, with a new `asOf`, immediately before it acts.

Query cost. `can()` for one record reads that record's relation rows once and keeps them for the request. Core also offers `canMany(user, permission, records)` for a known set, which reads the relation rows of all of them in one query. Lists never call `can()` per row: they use the SQL filter from `scopesFor()`.

Explanation. For any grant, core can show the role assignment, the group or direct path that made the user a holder, and for a relation grant the row's relation, source, person acted for, and validity window. The Access overview of `DEC-50` shows "may open this module" (`approvals:use`) apart from "may read this case".

#### Relation rules for cases

- `requester`, `assignee`, `past-actor`, and `viewer` are written when the case changes. A person who acted as themself gets a `past-actor` row with no end. That matches the product rule that "whoever acted as themself" keeps view.
- Acting for someone never creates lasting visibility. A delegate or backup gets a `delegate` row whose `valid_until` is the end of the delegation or absence. When a delegation ends early or a backup is removed, `approvals` sets `valid_until` to now in the same transaction. The person acted for keeps their own rows.
- Department follows the requester's current department (owner decision). The module's configuration lists which groups are departments. A `department` row names the requester's current department group. Core publishes a generic event when a person's group memberships change, after a sync at sign-in or an edit on the Groups screen. `approvals` subscribes and rewrites the `department` rows of that person's cases in one transaction. The old department head loses the cases on the next request after that event is processed.
- All times are stored in UTC. The module converts a delegation's dates from the deployment's time zone setting.
- Reconciliation, when a bug is found, rebuilds a case's rows from the current case state plus its history plus the current delegations, absences, and memberships. It locks the case row first, writes with the case's current revision, removes stale rows, and is audited. It never writes a row whose validity already ended.

### 4. Entry, starting, acting, and the sidebar

| Question | Decided by | Where it lives |
|---|---|---|
| May this person open the approvals workspace? | `approvals:use`, tenant-wide | Role assignment, by an administrator |
| May this person start workflow W? | W's start group (TD-035), and the person must also hold `approvals:use` | Workflow data, by a designer |
| Must this person act on a step? | The step's named person, the requester, or a backup | Workflow data, by a designer |
| May this person design workflows? | `approvals:design`, tenant-wide or scoped to `workflow:<id>` | Role assignment |

- Core gains a generic navigation provider: a module may supply a function that receives the tenant context and the caller and returns entries, each with a required permission and an optional resource. `permittedNavigation()` passes that resource to `can()`. `approvals` returns one entry per published workflow whose start group holds the caller, with the required permission `approvals:use`.
- Workflow placement under headings such as Legal or IT uses the category contribution of `DEC-51`. The landing page stays as `DEC-49` defines it, see open point 2.
- Core gains a generic query, "effective holders": the active people who hold a permission, optionally for one resource, and the groups that hold it through their own assignment. It is paginated and only callers holding the module's design or admin key may run it. The builder's person picker and start-group picker use it with `approvals:use`.
- Checks at run time, not only at publish: starting a case checks the start group and `approvals:use`. Opening a task checks that the assignee is active and holds `approvals:use`. If not, the task goes to the step's backups, and if none can act, to the approvals administrators' reassignment queue. Publishing reports people and groups that fail these checks as an early warning.
- The workflow designer is a workspace page gated by `approvals:design` plus `approvals:use`. It is not an admin page, so the contract rule that admin entries need `approvals:admin` does not apply to it.

### 5. How the register learns about cases

- `approvals` publishes one durable event, `approvals.case-changed` version 1, on one queue per case, after every committed change of a case whose workflow has the tag `contract`. The payload is a full snapshot: case id, workflow id, definition version, form schema version, a revision that rises with every change, the lifecycle state (`in-review`, `completed`, `withdrawn`), the status id and label, the submitted, completed, and withdrawn times, the form values, and the file ids.
- `contracts` applies a snapshot in one transaction: it locks or creates the register entry by the unique source case id, ignores a snapshot whose revision is not greater than the stored one, updates the projected fields, and allocates the register number once, when the state first becomes `completed`. A number, once allocated, never changes. A withdrawn case before registration marks the entry withdrawn. Fields that `contracts` owns, such as signing records and corrections, are never overwritten by a snapshot.
- The register shows an entry as "In review" until the `completed` snapshot arrives, and the number appears with it. The number is therefore given shortly after completion, not inside the completion transaction as the product's own design does. See open point 3.
- Rebuild. `approvals` provides a system capability, `case-snapshots`, declared in `packages/core/contracts`: it pages through the snapshots of every case of a `contract` workflow, including withdrawn cases, ordered by revision time and case id, from a checkpoint. It is a system read. Only a job that core runs for a module maintenance action may call it, never a user request or an agent tool. The action "Rebuild the register" requires `contracts:admin`, needs both modules enabled, is audited, and merges each snapshot through the same atomic rule as the event, so it can run while events arrive. `contracts` runs it when it is first enabled and after a gap.
- Event and capability shapes live in `packages/core/contracts` (`DEC-42`). See open point 1.

### 6. Permission keys

Keys follow the contract format `<module>:<action>`, two parts:

| Key | Meaning |
|---|---|
| `approvals:use` | Open the approvals workspace |
| `approvals:case-read` | Read a case, through relation scopes, a `workflow:<id>` scope, or tenant-wide |
| `approvals:report` | See turnaround and bottleneck reports, over the cases the caller may read |
| `approvals:design` | Edit and publish workflows, tenant-wide or scoped to `workflow:<id>` |
| `approvals:run-log` | Read the run log of HTTP steps, which can hold agreement text |
| `approvals:admin` | The module's admin pages, such as statuses, absences, and reassignment, with its platform meaning |
| `contracts:use` | Open the register workspace |
| `contracts:read` | Read the register and expiry lists and the files of register entries |
| `contracts:manage` | Register work: amended versions and checks |
| `contracts:admin` | The register's admin pages and the rebuild action |

The product's `view:department` and `view:all` keys become `approvals:case-read` with a department relation scope and with a tenant-wide scope.

### 7. What core gains, under principle 9

| Core change | Generic name | Contract row it extends | Acceptance proof without any customer module |
|---|---|---|---|
| Relation table, write API, relation scope, relation-only roles, `canMany()` | Record relations | Record types | The placeholder module declares a relation, writes rows, and passes the shared access suite. It includes refused writes for another module's record type, refused relation scopes on a foreign permission, and paired detail and list tests for expiry boundaries, archived groups, removed memberships, early ends, and surviving grants. |
| Navigation provider with resource-aware checks | Request-time navigation | Navigation | The placeholder returns one entry per placeholder record |
| Effective holders query | Permission holders | Capabilities (core service) | Tested on core roles and the placeholder key, with archived groups and disabled people excluded |
| Group membership changed event | Membership events | Events | Emitted by the sync and the Groups screen, consumed by a placeholder subscriber |
| System capabilities, callable only from module maintenance jobs | System capabilities | Capabilities | A placeholder system capability refused from a user request and from an agent tool |
| Outbound HTTP service with an allowed-host list, owning secret resolution | Outbound HTTP | Integrations | A placeholder HTTP call against a test server, then the Solutions chat proxy moves onto it |

An image built with no business module must start and pass the core test suite, with `record_relation` empty. Core code names no module outside tests, fixtures, examples, and `packages/core/contracts`. These are acceptance proofs for the specifications that implement each change, not claims about existing code.

### 8. Scale

One customer's register can reach millions of rows over the years. The design holds that size in one Postgres database:

- Lists use cursor pagination with a stable order that ends in the record id. Index choices come from measured query plans.
- The access filter runs in the database through the relation subquery, never as a check per row in code.
- A total, exact or estimated, counts only the caller's readable records under the same filters. When that is too slow, the page shows no total and only says whether more rows exist. An estimate is labelled as one.
- Agreement files use the `s3` file adapter where the customer requires it (`DEC-20`).
- Partitioning old cases or the audit log by year stays open until a measured query needs it.

## Why

What the decision gains:

- One engine serves every approval flow of every customer, and a new flow is configuration when the step kinds can express it.
- One stated rule serves detail checks, lists, totals, exports, and agent tools, with one time and one membership set per request.
- Delegation and backup access ends on time without a timer job, because the validity window is part of the rule.
- An administrator grants access on the same People and Roles screens as everything else, and every grant can be explained.
- The register converges on the latest case state whatever the delivery order, and its number is allocated once.
- Core stays free of workflow knowledge. Each core change is generic and has a placeholder acceptance proof.

What the decision costs:

- Six core changes, each with its own specification.
- Relation rows must follow every case change, delegation change, and membership change. A bug in `approvals` can leave stale rows until reconciliation runs.
- Current-department visibility rewrites a person's department rows when they move, which can touch many rows for a long-serving requester.
- The register number arrives just after completion instead of inside it.
- A register reader sees every agreement, so a person who needs only their own agreements in the register cannot get that without a later change.
- The workflow engine becomes the largest module in the repository, with its own jobs, retries, timeouts, and idempotent HTTP calls on the core job worker.

## Consequences

- Before `approvals` ships, the platform also needs: module pages with nested routes and server data loading, composed on the oRPC module contracts of ADR 0011; the notification inbox and its module API (`DEC-21`); and the `s3` adapter in deployments whose documents require it.
- The workflow form engine is module-local. `DEC-28` limits only the core configuration form. Accepting this record does not approve a form library. The form engine and its dependencies need their own decision, against the repository's TanStack Form and zod conventions.
- Secrets stay as environment references for this release. The core outbound HTTP service resolves and sends them, so the module never sees a secret. A screen that lets an administrator type a secret needs a separate storage decision.
- Imported history (agreements from the old system) enters the register as entries with a source id and provenance, with no invented workflow history. The import is idempotent and keeps number continuity. The bulk file migration follows `DEC-20` and has its own procedure.
- Discovery is not closed. Before work starts, each module's `discovery.md` records an answer map for D-1 to D-12: the source, whether it is a customer fact or a design proposal, and what it blocks. Which groups count as departments is recorded there.
- The provisional shapes in `docs/modules/approvals/README.md` and `docs/modules/contracts/README.md` change to match this record.
- An agent that reads cases or register entries, such as the boss agent of `DEC-29`, reads them only through capabilities that apply this record's rules for the signed-in user.

## Open points

1. Event and capability shapes in `packages/core/contracts` (`DEC-42`) reach every customer's image, also for a customer without these modules. `DEC-33` keeps other customers' module code and table shapes off a customer's servers. Decide whether shared contracts are generated per image from the included modules, or whether a shape is acceptable platform surface. Principle 9 allows the folder, so this is a `DEC-33` question only.
2. Whether a deployment may choose the approvals portal as its landing page, which amends `DEC-49`.
3. Whether the customer accepts the register number shortly after completion, or requires it inside the completion transaction, which merges the modules.
4. How a customer's flow definitions are versioned in the repository: an export file in `customers/<slug>/`, or data only.

Revisit when a second module needs relations that this table cannot express, such as a relation that depends on another relation. The change then is ADR 0004's relationship engine behind the same `can()` and `scopesFor()` calls, and modules keep writing facts through the same API.

## Review findings and answers

Findings of the critique of revision 1:

| Finding | Answer |
|---|---|
| 1. Two implementations of the relation rule | Section 3: one table and one effective-access rule for detail checks and lists |
| 2. Delegation expiry undecided | Section 3, relation rules for cases: validity windows, no lasting visibility from acting for someone |
| 3. Silent default grant | Section 3: roles seeded unassigned, scoped assignments written by an explicit administrator action |
| 4. Sidebar needs a core change | Section 4: request-time navigation provider |
| 5. Register event incomplete | Section 5: one snapshot event, atomic apply, rebuild |
| 6. No ownership boundary for relations | Section 3: one owner per record type, refused foreign writes and foreign relation scopes |
| 7. Per-record cost and unexplained grants | Section 3: `canMany()`, SQL filter for lists, explanation with the assignment path |
| 8. Invalid permission keys | Section 6 |
| 9. Split not honestly established | Considered options and section 1 |
| 10. Deferred work incomplete | Consequences |
| 11. Discovery treated as settled | Consequences: answer map required before work |
| 12. Overstated claims | Bounded wording, with the within-request consistency limit stated |

Findings of the cross-family review of revision 2:

| Finding | Answer |
|---|---|
| 1. Relation scopes have no representation on a role | Section 3: one scoped assignment per relation, relation-only roles refuse a null scope, the rows shown |
| 2. Detail and list agreement not established | Section 3, the effective-access rule: database memberships without archived groups, one `asOf`, one interval predicate, stated consistency, fresh context for jobs |
| 3. Four events not convergent | Section 5: one full snapshot event, atomic revision compare, number allocated once |
| 4. Rebuild incomplete and without authority | Section 5: system capability over all states, maintenance job only, `contracts:admin`, same atomic merge |
| 5. Stale department and unsafe reconciliation | Section 3: current department through the membership event, reconciliation from current state with a lock and revision |
| 6. Copied data and file access undecided | Sections 1 and 2: owner decision on audiences, each module issues file links from its own record |
| 7. Picker mixes entry, starting, and acting | Section 4: decision table, TD-035 kept, effective holders query, run-time checks and reassignment |
| 8. Query bound not possible | Section 3: per-record read kept per request, `canMany()` for known sets |
| 9. Totals can leak | Section 8: totals over the caller's readable set only, or no total |
| 10. Principle 9 proofs incomplete | Section 7: placeholder proof for every change, zero-module image must start |
| 11. Hidden contract choices | Sections 3, 4, and 6: refused foreign scopes, explanation fields, designer placement |

---
status: proposed
date: 2026-10-20
amends: DEC-39 (a role assignment gains a relation scope), DEC-48 (the loader reads relation rows), the module contract rows Record types and Navigation, docs/modules/approvals and docs/modules/contracts provisional shapes
---

# Approvals as a reusable workflow module, contracts as its first consumer, and core-owned record relations

The first customer's product is a legal agreement approval flow. Its own design builds that flow on a general workflow builder: versioned workflow definitions, five step kinds (start, approval, condition, outbound HTTP call, end), one form per workflow, configurable statuses, backups, leave, and delegation. The same engine is meant to run that customer's later flows and other customers' flows. The owner wants Ops Center to work as a company portal, where every published flow appears in the sidebar for the people allowed to use it.

This record settles five questions. Where does the workflow engine live? Who may see a case, and how do detail checks and list queries give the same answer? How does a published flow become a sidebar entry? How does the agreement register learn about cases? What does core gain, and how does it stay free of module knowledge?

Revision 2 of 2026-10-20 replaces the first draft after an independent critique of 2026-10-19 with the verdict "rework". Each critique finding is answered in the table "Critique findings and answers" at the end. Vision principle 9, "Core knows no module" (proposed on branch `chore/vision-core-knows-no-module`), is the test for every core change here.

A throwaway logic prototype illustrates the portal. It lives on the branch `chore/prototype-workflow-builder`, in `docs/modules/approvals/PROTOTYPE-workflow-builder.html`. Its sidebar and register logic are simulated and decide nothing.

## Considered options

Where the engine lives:

1. One combined module that holds the engine, the flows, and the agreement register. It can run several flows through one engine. Rejected as the default because a later customer that wants only approval flows would carry legal register code and tables. It stays the fallback: see "When to merge the two modules back".
2. In core. Rejected: the vision lists "a general workflow engine before a module needs one" as a non-goal, and principle 9 forbids core from knowing a module's domain.
3. A reusable `approvals` module with the engine and the builder, a `contracts` module with the register, and each customer's flows as data. Chosen.

How a person sees a case because of their part in it (requester, current approver, past actor, delegate):

1. The module checks relations itself behind one broad permission. Rejected: it breaks `DEC-39` and keeps the rule in two places, a detail check and a list filter.
2. A relation resolver that core calls for each record, with the module writing a matching SQL filter for lists (the first draft). Rejected: two implementations of one rule can drift, which leaks or hides cases. It also costs one call per record on a list.
3. Per-case `role_assignment` rows. Possible through core's writer, but it mixes administrative grants with facts derived from workflow state, and the table has no validity window or provenance.
4. A core-owned relation table, written by the module in the same transaction as its own change, and read by core for both detail checks and lists. Chosen.
5. A general relationship engine (ADR 0004's upgrade path). Not needed yet. Option 4 keeps that path open.

## Decision

### 1. The module split

- `approvals` is a capability module. It owns workflow definitions and versions, the builder screens, the step kinds, one form per workflow, cases and their history, statuses, and backups, leave, and delegation. It knows no business domain. A case runs on the definition version it started on.
- `contracts` is a capability module. It owns the agreement register, register numbers, signing records, amended versions, and import and export. It never imports `approvals`, and `approvals` never imports `contracts`.
- A customer's flows are data, drawn in the builder or imported from an export file. A new flow needs no code when the existing step kinds, form fields, and integrations can express it.
- Field ownership across the two modules is fixed before either is built:

| Data | Owner | The other module sees it through |
|---|---|---|
| Case, form values, history, assignees, statuses | `approvals` | Events (section 4) |
| Register row, register number, signing record, concluded date, expiry | `contracts` | Nothing. `approvals` never reads the register. |
| Agreement files and their versions | `approvals` while the case runs, `contracts` after registration | File ids in event payloads. Bytes stay in `FileStorage` (`DEC-20`). |
| Corrections after registration (amended versions) | `contracts` | Nothing. A correction never reopens a case. |
| Mapping from a flow's form fields to register fields | `contracts` | A versioned mapping per workflow id and form schema version, kept in `contracts` configuration. A `contract` tag on the workflow selects which flows the register reads. |

#### When to merge the two modules back

The module contract says that modules which need each other's data often and synchronously belong together. If building the register shows that `contracts` must write back into a running case, or must answer inside the completion transaction, the two modules merge into one, and this record is amended.

### 2. Who may see a case: core-owned record relations

Core gains one generic table and one write API. Neither knows workflows, cases, or contracts.

`record_relation`: id, module_id, record_type, record_id, principal_type (`user` or `group`), principal_id, relation, valid_from, valid_until (nullable), source, acting_for_user_id (nullable), created_at. Index on (record_type, record_id) and on (principal_type, principal_id, relation).

Rules:

- A module declares, per record type it owns, the relation names it writes, for example `requester`, `assignee`, `past-actor`, `delegate`, `viewer`, `department`. Core refuses a write for a record type the module does not own, or for an undeclared relation name. Two modules cannot declare the same record type, so a relation of `approvals` can never apply to a `contracts` record.
- A module writes relation rows only through the core API `ctx.tenant.relations`, inside the same database transaction as the module's own change. Core records an audit event for every relation write, with the source, for example the case event that caused it.
- A role assignment may carry the scope type `relation` with the scope id `<record-type>.<relation>`, for example `case.past-actor`. It means: this permission applies to every record of that type where the person holds that relation now.
- A `group` row grants the relation to every current member of that group. The `department` relation uses it: the module writes the requester's department group on the case.
- `can(user, permission, resource)` returns true when any grant applies: tenant-wide, record scope, parent scope, or relation scope. A relation scope applies when a row exists for that record, the relation, and the person or one of their groups, and `now()` is inside its validity window. An unknown relation grants nothing.
- `scopesFor(user, permission)` returns relation scopes as a core-built SQL subquery over `record_relation` with the same rule. The module puts it into its own `WHERE` clause. Filtering happens before pagination, totals, export, and any agent tool, so a detail check and a list always agree (`DEC-39`).
- The per-request loader of `DEC-48` reads the person's relation rows for the records it is asked about in one batched query per request and record type, never one query per record.

Time rules, decided now:

- Acting for someone never creates lasting personal visibility. A delegate or backup gets a `delegate` row whose `valid_until` is the end of the delegation or absence. When a delegation ends early, the module sets `valid_until` to now in the same transaction. The person acted for keeps their own rows.
- A person who acted as themself gets a `past-actor` row with no end date. That matches the product rule that "whoever acted as themself" keeps view.
- All times are stored in UTC. The module converts a delegation's dates from the deployment's time zone setting when it writes the row.
- Revocation applies on the next request, as `DEC-48` promises for roles. A long action, such as a background HTTP step, checks the actor's right again when it acts.

No default grant. `approvals` seeds a system role "Case participant" that carries `approvals:case-read` with relation scopes for `requester`, `assignee`, `past-actor`, `delegate`, and `viewer`. Installing the module assigns it to nobody (permission evolution policy). The module's setup screen offers the assignment to a group, usually all staff, as an explicit administrator action that is audited. Administrators narrow access by changing assignments. System role definitions stay read-only.

Each relation row can explain itself: the relation, the source, the person acted for, and the validity window. The Access overview of `DEC-50` shows "may open this module" (`approvals:use`) apart from "may read this case" (relation grants).

Cost: relation rows must follow every case change, reassignment, and delegation change. Writes in the same transaction keep them correct, and a reconciliation job in `approvals` rebuilds a case's rows from its history when a bug is found.

### 3. Flows in the sidebar, and who the builder may pick

- `approvals` declares a record type `workflow`. A role carrying `approvals:use` scoped to `workflow:<id>` lets a person or group start that workflow. A tenant-wide grant covers every workflow.
- Core gains a generic navigation provider: a module may supply a function that receives the tenant context and the caller and returns entries, each with a required permission and an optional resource. `permittedNavigation()` then passes that resource to `can()`. Today navigation is a static list and `can()` is called without a resource, so this is a real core change. `approvals` uses it for one entry per published workflow the caller may start.
- Workflow placement under headings such as Legal or IT uses the existing category contribution of `DEC-51`, implemented by the module for its workflow records.
- The landing page stays as `DEC-49` defines it. Whether a deployment may choose the approvals portal as its landing page is an open point.
- Core gains a generic query: which people and which groups hold a permission, optionally for one resource. The builder's person picker and start-group picker use it with `approvals:use`, like an assignee picker that lists only assignable users. Publishing also refuses a workflow whose named people or start groups cannot open the module, as a safety net for people who lose access later.
- Who acts on each step is workflow data, not a role: a named person, the requester, or a backup. Being named in a step grants no permission by itself. The module writes an `assignee` relation row when the task opens.

### 4. How the register learns about cases

- `approvals` publishes durable, serialized events per case: `approvals.case-submitted`, `approvals.case-status-changed`, `approvals.case-completed`, and `approvals.case-withdrawn`, each version 1. Each payload carries the case id, workflow id, definition version, form schema version, a revision number that rises with every change of the case, the workflow tags, the form values, and the file ids.
- `contracts` keeps the register as a projection of these events. It ignores an event whose revision is not newer than the one it stored, so retries and duplicates do no harm. Failed handlers go to the dead-letter queue of the event bus, and an administrator retries them.
- The register number is assigned once, inside the `contracts` transaction that registers the case. The number is therefore given shortly after the case completes, not inside the completion transaction as the product's own design does. The register shows "Registration pending" until then. If the customer requires the number inside the completion transaction, the two modules merge (section 1).
- When `contracts` is absent or disabled, `approvals` still completes cases and nothing is registered. When `contracts` is installed or enabled later, it rebuilds the register by reading completed cases through a read capability that `approvals` publishes in the capabilities registry. Neither module imports the other.
- Event shapes live in `packages/core/contracts`, as `DEC-42` requires. That puts the names and shapes into every customer's image. See open point 1.

### 5. Permission keys

Keys follow the contract format `<module>:<action>`, two parts:

| Key | Meaning |
|---|---|
| `approvals:use` | Open the approvals workspace and start a workflow, tenant-wide or scoped to `workflow:<id>` |
| `approvals:case-read` | Read a case, through relation scopes, a parent `workflow:<id>` scope, or tenant-wide |
| `approvals:view-department` | Read cases of one's own department, through the `department` relation |
| `approvals:report` | See turnaround and bottleneck reports |
| `approvals:design` | Edit and publish workflows, tenant-wide or scoped to `workflow:<id>` |
| `approvals:run-log` | Read the run log of HTTP steps, which can hold agreement text |
| `approvals:admin` | The module's admin pages, with the platform meaning the contract already gives it |
| `contracts:use` | Open the register workspace |
| `contracts:read` | Read the register and expiry lists |
| `contracts:manage` | Register work: amended versions and checks |

### 6. What core gains, under principle 9

| Core change | Generic name | Contract row it extends | Proof without either customer module |
|---|---|---|---|
| Relation table, write API, relation scope in `can()` and `scopesFor()` | Record relations | Record types | The placeholder module declares a relation, writes rows, and passes the shared access suite, including a refused write for another module's record type |
| Navigation provider with resource-aware checks | Request-time navigation | Navigation | The placeholder returns one entry per placeholder record |
| "Who holds permission X" query | Permission holders | Capabilities (core service) | Tested on core roles and the placeholder key |
| Outbound HTTP service with an allowed-host list, owning secret resolution | Outbound HTTP | Integrations | The Solutions chat proxy moves onto it |

A deployment built without `approvals` and `contracts` must pass the core test suite, with `record_relation` empty. Core code names no module outside tests, fixtures, examples, and `packages/core/contracts`.

### 7. Scale

One customer's register can reach millions of rows over the years. The design holds that size in one Postgres database:

- Lists use cursor pagination with an index that matches each filter.
- The access filter runs in the database through the relation subquery, never as a check per row in code.
- Totals over large lists use an estimate or a counter kept by the module, not a full count on every page.
- Agreement files use the `s3` file adapter where the customer requires it (`DEC-20`).
- Partitioning old cases or the audit log by year stays open until a measured query needs it.

## Why

What the decision gains:

- One engine serves every approval flow of every customer, and a new flow is configuration when the step kinds can express it.
- One relation rule serves detail checks, lists, totals, exports, and agent tools, so they cannot disagree.
- Delegation and backup access ends on time without a timer job, because the validity window is checked on every read.
- An administrator grants a flow on the same People and Roles screens as everything else, and every relation grant can be explained.
- Core stays free of workflow knowledge. Each core change is generic and proven with the placeholder module.

What the decision costs:

- Four core changes, each with its own specification: record relations, request-time navigation, permission holders, and outbound HTTP.
- Relation rows must follow every case change. A bug in `approvals` can leave stale rows until reconciliation runs.
- The register number arrives just after completion instead of inside it, with a visible pending state.
- Two modules with four versioned events between them, which must stay compatible.
- The workflow engine becomes the largest module in the repository, with its own jobs, retries, timeouts, and idempotent HTTP calls on the core job worker.

## Consequences

- Before `approvals` ships, the platform also needs: module pages with nested routes and server data loading, composed on the oRPC module contracts of ADR 0011; the notification inbox and its module API (`DEC-21`); and the `s3` adapter in the deployment where documents require it.
- The workflow form engine is module-local. `DEC-28` limits only the core configuration form. Accepting this record does not approve a form library. The form engine and its dependencies need their own decision, against the repository's TanStack Form and zod conventions.
- Secrets stay as environment references for this release. The core outbound HTTP service resolves and sends them, so the module never sees a secret. A screen that lets an administrator type a secret needs a separate storage decision.
- Imported history (agreements from the old system) enters the register as rows with a source id and provenance, with no invented workflow history. The import is idempotent and keeps number continuity. The bulk file migration follows `DEC-20` and has its own procedure.
- Discovery is not closed. Before work starts, each module's `discovery.md` records an answer map for D-1 to D-12: the source, whether it is a customer fact or a design proposal, and what it blocks. How departments reach Ops Center (directory groups or local groups) is recorded there.
- The provisional shapes in `docs/modules/approvals/README.md` and `docs/modules/contracts/README.md` change to match this record.
- An agent that reads cases, such as a future boss agent, reads them only through capabilities filtered by the same relation subquery.

## Open points

1. Event shapes in `packages/core/contracts` (`DEC-42`) reach every customer's image, also for a customer without these modules. `DEC-33` keeps other customers' module code and table shapes off a customer's servers. Decide whether shared contracts are generated per image from the included modules, or whether an event shape is acceptable platform surface.
2. Whether a deployment may choose the approvals portal as its landing page, which amends `DEC-49`.
3. Whether the customer accepts the register number shortly after completion, or requires it inside the completion transaction, which merges the modules.
4. How a customer's flow definitions are versioned in the repository: an export file in `customers/<slug>/`, or data only.

Revisit when a second module needs relations that this table cannot express, such as a relation that depends on another relation. The change then is ADR 0004's relationship engine behind the same `can()` and `scopesFor()` calls, and modules keep writing facts through the same API.

## Critique findings and answers

| Finding | Answer in this revision |
|---|---|
| 1. Two implementations of the relation rule | Section 2: one core table read by both `can()` and `scopesFor()`, filtering before pagination |
| 2. Delegation expiry undecided | Section 2, time rules: validity windows, no lasting visibility from acting for someone |
| 3. Silent default grant | Section 2: role seeded with no assignment, explicit audited administrator choice |
| 4. Sidebar needs a core change | Section 3: request-time navigation provider with resource-aware checks, `DEC-51` categories, `DEC-49` open |
| 5. Register event incomplete | Section 4: four lifecycle events, revisions, dedupe, pending state, rebuild when installed later |
| 6. No ownership boundary for relations | Section 2: one owner per record type, core refuses foreign and undeclared writes, negative placeholder test |
| 7. Per-record cost and unexplained grants | Section 2: one batched query per request and type, explanation fields, separate Access views |
| 8. Invalid permission keys | Section 5: two-part keys, `approvals:admin` keeps its platform meaning, `approvals:design` separate |
| 9. Split not honestly established | Considered options and section 1: combined module as fallback, ownership table, merge-back rule |
| 10. Deferred work incomplete | Consequences: routes, notifications, form engine, secrets, import, S3 |
| 11. Discovery treated as settled | Consequences: D-1 to D-12 answer map required, departments recorded there |
| 12. Overstated claims | Bounded wording throughout; the prototype marked as an illustration |

---
status: accepted
date: 2026-10-20
amends: DEC-39 (a role assignment gains a relation scope), DEC-48 (the loader reads relation rows at one time per request), the module contract rows Record types, Permission keys, and Navigation, docs/modules/approvals and docs/modules/contracts provisional shapes
---

# Approvals as one reusable workflow module with an agreement register, and core-owned record relations

The first customer's product is a legal agreement approval flow. Its own design builds that flow on a general workflow builder: versioned workflow definitions, five step kinds (start, approval, condition, outbound HTTP call, end), one form per workflow, configurable statuses, backups, leave, and delegation. A finished agreement enters a register with a number, signing records, and expiry dates. The same engine is meant to run that customer's later flows and other customers' flows. The owner wants Ops Center to work as a company portal, where every published flow appears in the sidebar for the people allowed to use it.

This record settles four questions. What does the module hold, and where does the register live? Who may see a case or a register entry, and how do detail checks and list queries give the same answer? How does a published flow become a sidebar entry, and who may start and act on it? What does core gain, and how does it stay free of module knowledge?

Revision history. Revision 1 (2026-10-19) split the product into an `approvals` module and a `contracts` module and got the verdict "rework" from an independent critique. Revision 2 (`0711b27`) answered it and got "rework" from a cross-family review. Revision 3 (`6cd25cb`) answered that review and recorded three owner decisions of 2026-10-20: department visibility follows the requester's current department, the workflow's start group decides who starts (the product's rule TD-035), and the full agreement list is read only by holders of a register permission. Revision 4 (this text) merges the two modules into one, by owner decision of 2026-10-20, because the split needed an event protocol, a rebuild job, a pending state, two owners per file, and still could not show the register number on the requester's own case. A final cross-family review of revision 4 returned "accept after fixes"; this text includes those fixes and two more owner decisions of 2026-10-20 (the landing page and where flow definitions live). The tables at the end map every review finding to its answer. Amended 2026-10-21 (owner): the module has no department logic, as in the product's own rule PD-112. Department rows, the core membership event, and the before-enable step are removed. A department head sees the cases they handle through relations, and the cases of their department's workflows through a workflow group grant (section 3). Vision principle 9, "Core knows no module" (on `develop` since 2026-10-20), is the test for every core change here.

A throwaway logic prototype illustrates the portal, on the branch `chore/prototype-workflow-builder`, in `docs/modules/approvals/PROTOTYPE-workflow-builder.html`. Its sidebar and register logic are simulated and decide nothing.

## Considered options

Where the engine and the register live:

1. In core. Rejected: the vision lists "a general workflow engine before a module needs one" as a non-goal, and principle 9 forbids core from knowing a module's domain.
2. Two modules, `approvals` for the engine and `contracts` for the register, joined by events (revisions 1 to 3). Rejected: the register needs the case's data at completion, the case needs the register number, and both need the same files and the same readers. The module contract says that modules which need each other's data often belong together. The split also moved the register number out of the completion transaction, against the product's own design. It served only a later customer that wants one half without the other, and no such customer exists.
3. One `approvals` module with the engine, the builder, and the register, where the register is a feature that a workflow turns on. Chosen.

How a person sees a case because of their part in it (requester, current approver, past actor, delegate, person acted for):

1. The module checks relations itself behind one broad permission. Rejected: it breaks `DEC-39` and keeps the rule in two places.
2. A relation resolver that core calls per record, with a matching SQL filter written by the module for lists. Rejected: two implementations of one rule can drift, and it costs one call per record.
3. Per-case `role_assignment` rows. Rejected: it mixes administrative grants with facts derived from workflow state, and the table has no validity window or provenance.
4. A core-owned relation table, written by the module in the same transaction as its own change, and evaluated by core with one rule for detail checks and lists. Chosen.
5. A general relationship engine (ADR 0004's upgrade path). Not needed yet. Option 4 keeps that path open.

## Decision

### 1. One module with a register feature

- `approvals` owns workflow definitions and versions, the builder, the step kinds, one form per workflow, cases and their history, statuses, backups, leave, and delegation, and the agreement register: register entries, register numbers, signing records, amended versions, expiry, and import and export.
- A customer's flows are data. A new flow needs no code when the existing step kinds, form fields, and integrations can express it.
- Flow definitions live in the customer's database, where their designers edit them (owner decision). The builder exports and imports a definition file. A seed export in `customers/<slug>/` is used only for first setup, and a customer's edits never need a release.
- Automatic registration is a feature of a workflow. A designer turns it on for a workflow and maps that workflow's form fields to register fields. The mapping is stored with the workflow definition version, so a case registers with the mapping of the version it ran on. A workflow without the feature never creates a register entry.
- The register itself is available whenever the deployment holds at least one register entry or one workflow with automatic registration. Imported entries with no workflow therefore stay reachable to `approvals:register-read` holders, with no dummy workflow.
- When a case of a register workflow completes, the module creates the register entry and allocates its number in the same transaction that completes the case, as the product's own design requires. There are no cross-module events, no rebuild job, and no pending state.
- Register invariants: one register entry per source case, enforced by a unique key on the source case id. The completion transition happens once, guarded by a conditional update on the case state. A retried completion returns the existing entry and number. A number, once allocated, never changes. A mapping that fails validation rolls back the completion. Fields that register work adds later, such as signing records and corrections, are never overwritten by a retry. Acceptance tests cover simultaneous completion and a retry after commit.
- A file is referenced by `file.id` from the case, and the register entry references the same file. The module issues a download link after `can()` on the record the reader opened: the case through `approvals:case-read`, the register entry through `approvals:register-read` (`data-shape.md`, Files).
- Checked on 2026-10-20 in `packages/core/src/services/file-storage/index.ts`: the file service offers `store`, `fetch`, `createLink`, and `fetchLink`, and no delete. A file therefore stays while any record references it. A later delete or retention feature must count references before it removes a file.
- The file service checks `can()` on the record named in a link request, but not that this record references the file. The module must name the record that references the file, and its tests prove that a reader of one case cannot obtain a link to another case's file.
- The module's own internal events, for example for notifications, are module business and declare nothing in `packages/core/contracts`.

#### When to split again

If a real customer needs only the register without the engine, or only the engine without carrying register code, the register moves into its own module. Revision 3 of this record (`6cd25cb`) holds the previous proposed design for that split, reviewed but never built: one snapshot event applied atomically, a system rebuild capability, and the trade-offs listed there.

### 2. Who may read what

Owner decisions of 2026-10-20 fix the audiences:

| Record | Who reads it |
|---|---|
| A case, its form values, history, files, and its register number and register fields | People related to the case (section 3), plus holders of a `workflow:<id>`, `workflow-group:<id>`, or tenant-wide `approvals:case-read` grant. A requester therefore sees her own agreements, their documents, and their register numbers in her case list. |
| The full agreement register, its entries, and their files | Holders of `approvals:register-read`, tenant-wide. Case participation alone grants no access to other people's register entries. |
| Search, reports, exports, and agent reads | The same rule as the records they return, applied in the query before pagination and totals |

### 3. Core-owned record relations

Core gains one generic table and one write API. Neither knows workflows, cases, or registers.

`record_relation`: id, module_id, record_type, record_id, principal_type (`user` or `group`), principal_id, relation, valid_from, valid_until (nullable), source, acting_for_user_id (nullable), created_at. `record_relation_version`: module_id, record_type, record_id, relation, version, updated_at, primary key on the four identifying columns. Index on (record_type, record_id) and on (principal_type, principal_id, relation, record_type).

Writes:

- A module declares, per record type it owns, the relation names it writes. Two modules cannot declare the same record type.
- A module writes rows only through `ctx.tenant.relations`, inside the transaction of its own change. Core refuses a write for a record type the module does not own, or for an undeclared relation.
- Versioned replacement. Core keeps a version row per record and relation, `record_relation_version`, which stays when the set of rows becomes empty. A write replaces the whole set of rows for one record and relation, and names the version it read. Core locks the version row, and accepts the write only when the stored version still equals the one named, then increments it. Otherwise the write fails with a conflict, and the writer reads the authoritative state again. Every writer uses this rule: case changes, delegation and absence changes, and reconciliation. A delayed old repair therefore always fails, even after the last row was removed.
- Read order. A writer reads the expected version first, and only then reads the authoritative inputs from which it derives the new rows. On a conflict it discards both the derived rows and those inputs, and retries the whole read, derive, and write. This order is what lets the version protect against stale input, not only against stale writes. Acceptance tests cover removing the last row and then an old repair that arrives afterwards, and this interleaving: repair A reads an active delegation, writer B ends it, then A tries to write.
- Idempotence comes from deriving fresh from current state in this read order.
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
| Case participant | same | same | `relation` `case.acted-for` |
| Workflow group reader | `approvals:case-read` | For example a department head | `workflow-group:<id>` |
| Case reader | `approvals:case-read` | For example the legal team | Tenant-wide, `workflow:<id>`, or `workflow-group:<id>` |
| Register reader | `approvals:register-read` | For example the legal team and the general manager | Tenant-wide |

No assignment of a relation-only role has a null scope. Administrators narrow access by removing assignments. System role definitions stay read-only.

Permission and record type compatibility. A module declares, for each of its permissions, the record types that permission may authorize, for example `approvals:case-read` for `case` and `approvals:register-read` for `register-entry`. `can()`, `canMany()`, and the list filter of `scopesFor()` answer false for a record of any other type, also under a tenant-wide grant. A check with no record, as navigation and module entry use, answers only "holds this key somewhere" and never authorizes reading a record. Negative acceptance cases: `approvals:case-read` on a register entry, `approvals:register-read` on a case, and the placeholder key on another module's record.

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
- Acting for someone never creates lasting visibility for the person who acts. A delegate or backup gets a `delegate` row whose `valid_until` is the end of the delegation or absence. When a delegation ends early or a backup is removed, the module sets `valid_until` to now in the same transaction.
- The person acted for gets an `acted-for` row with no end, written in the same transaction as the action. A department head on leave therefore keeps sight of a case that their backup approved for them, although the head never acted (amended 2026-10-21).

#### Workflow groups (amended 2026-10-21)

- The module has no department logic (the product's rule PD-112). A step names a person, and a department with its own head gets its own workflow copy.
- A workflow group is a named set of workflows, kept as module data, for example Sales holding a purchase approval and a contract approval. An administrator or designer puts each workflow in at most one group. A group only decides who reads, never who starts or acts.
- `workflow-group` is a record type of the module. The `case` record type declares `workflow` and `workflow-group` as parent types, and its resolver returns the case's workflow and that workflow's current group. `can()` matches the parent scopes, and the list filter of `scopesFor()` joins the case to its workflow's group (module contract, Record types row).
- The group belongs to the workflow, not to a definition version, so every case of the workflow follows it. Moving a workflow to another group is one data change that applies on the next request. No event, job, or recompute follows, because nothing is derived from group membership.
- A head of a department that has many workflows, such as a sales purchase approval and a sales contract approval, holds case-read on that department's group and reads every case of those workflows, whoever filed it. A case that a department member files in another department's workflow is outside that grant.
- Rationale for that gap (owner, 2026-10-21): no mechanism is added for it. If a head must see such cases, a designer gives the head a step in that workflow, for example an acknowledgement step. The step writes the `assignee` and `past-actor` rows, so the head sees every case that reaches it, with no new grant, no department rule, and no core change. This is the existing PD-112 pattern, not a new one: "Sales legal review" has the Sales staff as its start group and the Sales head as its first approver, and "Procurement legal review" is the same workflow with the Procurement staff and the Procurement head. Each head is a step only in their own copy, so they see only their own staff's cases.
- All times are stored in UTC. The module converts a delegation's dates from the deployment's time zone setting.
- Reconciliation, when a bug is found, rebuilds a case's rows from the current case state plus its history plus the current delegations and absences. It writes through the versioned replacement, so a concurrent change wins and the repair retries. It removes stale rows, is audited, and never writes a row whose validity already ended.

### 4. Entry, starting, acting, and the sidebar

| Question | Decided by | Where it lives |
|---|---|---|
| May this person open the approvals workspace? | `approvals:use`, tenant-wide | Role assignment, by an administrator |
| May this person start workflow W? | W's start group (TD-035), and the person must also hold `approvals:use` | Workflow data, by a designer |
| Must this person act on a step? | The step's named person, the requester, or a backup | Workflow data, by a designer |
| May this person design workflows? | `approvals:design`, tenant-wide or scoped to `workflow:<id>` | Role assignment |
| May this person open the full register? | `approvals:register-read`, tenant-wide | Role assignment |

- Core gains a generic navigation provider: a module may supply a function that receives the tenant context and the caller and returns entries, each with a required permission and an optional resource. `permittedNavigation()` passes that resource to `can()`. The module returns one entry per published workflow whose start group holds the caller, with the required permission `approvals:use`, and one register entry for holders of `approvals:register-read`.
- Workflow placement under headings such as Legal or IT uses the category contribution of `DEC-51`. The landing page stays the Solutions hub of `DEC-49` (owner decision 2026-10-20). The hub links to the approvals portal.
- Core gains a generic query, "effective holders": the active people who hold a permission, optionally for one resource, and the groups that hold it through their own assignment. It is paginated. Core sets no caller rule of its own: the module procedure that calls it first checks the caller's own permission and resource. The builder's pickers check `approvals:design` for the workflow being edited, then ask for holders of `approvals:use`. A designer scoped to one workflow is refused for another workflow, and an acceptance test proves it.
- Checks at run time, not only at publish: starting a case checks the start group and `approvals:use`. Opening a task checks that the assignee is active and holds `approvals:use`. If not, the task goes to the step's backups, and if none can act, to the administrators' reassignment queue. Publishing reports people and groups that fail these checks as an early warning.
- The workflow designer is a workspace page gated by `approvals:design` plus `approvals:use`. It is not an admin page, so the contract rule that admin entries need `approvals:admin` does not apply to it.

### 5. Permission keys

Keys follow the contract format `<module>:<action>`, two parts:

| Key | Meaning |
|---|---|
| `approvals:use` | Open the approvals workspace |
| `approvals:case-read` | Read a case, including its register number and register fields, through relation scopes, a `workflow:<id>` scope, or tenant-wide |
| `approvals:register-read` | Open the full agreement register and expiry lists and the files of register entries |
| `approvals:register-manage` | Register work: amended versions and checks |
| `approvals:report` | See turnaround and bottleneck reports, over the cases the caller may read |
| `approvals:design` | Edit and publish workflows, tenant-wide or scoped to `workflow:<id>` |
| `approvals:run-log` | Read the run log of HTTP steps, which can hold agreement text |
| `approvals:admin` | The module's admin pages, such as statuses, absences, and reassignment, with its platform meaning |

The product's keys map as follows: `view:department` and `view:all` become `approvals:case-read` with a `workflow-group:<id>` scope and with a tenant-wide scope, `contracts:read` becomes `approvals:register-read`, and `contracts:manage` becomes `approvals:register-manage`.

### 6. What core gains, under principle 9

| Core change | Generic name | Contract row it extends | Acceptance proof without any customer module |
|---|---|---|---|
| Relation table, version table, write API, relation scope, relation-only roles, permission and record type compatibility, `canMany()` | Record relations | Record types and Permission keys | The placeholder module declares a relation, writes rows, and passes the shared access suite. It includes refused writes for another module's record type, refused relation scopes on a foreign permission, refused reads of a record type the permission does not cover, a stale versioned write after the last row was removed, and paired detail and list tests for expiry boundaries, archived groups, removed memberships, early ends, and surviving grants. |
| Navigation provider with resource-aware checks | Request-time navigation | Navigation | The placeholder returns one entry per placeholder record |
| Effective holders query | Permission holders | Capabilities (core service) | Tested on core roles and the placeholder key, with archived groups and disabled people excluded |
| Outbound HTTP service with an allowed-host list, owning secret resolution | Outbound HTTP | Integrations | A placeholder HTTP call against a test server, then the Solutions chat proxy moves onto it |

An image built with no business module must start and pass the core test suite, with `record_relation` empty. Core code names no module outside tests, fixtures, and examples, and this record adds nothing to `packages/core/contracts`. These are acceptance proofs for the specifications that implement each change, not claims about existing code.

### 7. Scale

One customer's register can reach millions of rows over the years. The design holds that size in one Postgres database:

- Lists use cursor pagination with a stable order that ends in the record id. Index choices come from measured query plans.
- The access filter runs in the database through the relation subquery, never as a check per row in code.
- A total, exact or estimated, counts only the caller's readable records under the same filters. When that is too slow, the page shows no total and only says whether more rows exist. An estimate is labelled as one.
- Agreement files use the `s3` file adapter where the customer requires it (`DEC-20`).
- Partitioning old cases, register entries, or the audit log by year stays open until a measured query needs it.

## Why

What the decision gains:

- One engine serves every approval flow of every customer, and a new flow is configuration when the step kinds can express it.
- The register number is allocated in the completion transaction, so a completed case always has its number, and the requester sees it on her own case.
- No cross-module protocol: no events between modules, no rebuild job, no pending state, and one owner per file.
- One stated access rule serves detail checks, lists, totals, exports, and agent tools, with one time and one membership set per request.
- Delegation and backup access ends on time without a timer job, because the validity window is part of the rule.
- Core stays free of workflow knowledge. Each core change is generic and has a placeholder acceptance proof.

What the decision costs:

- A customer that wants approval flows without a register still receives the register code and its empty tables. The register is generic, not one customer's code, so `DEC-33` is not touched, but the image is larger.
- A customer that wants only a register must take the workflow engine, or wait for the split described above.
- One large module: the engine, the builder, and the register, with their own jobs, retries, timeouts, and idempotent HTTP calls on the core job worker.
- Four core changes, each with its own specification.
- Relation rows must follow every case change and delegation change. A bug in the module can leave stale rows until reconciliation runs.
- A department head does not see a case that a department member files in another department's workflow, unless a designer gives the head a step in that workflow (section 3, Workflow groups).
- Administrators keep workflows in the right group. A workflow in no group is read only through relations, `workflow:<id>` grants, and tenant-wide grants.
- A register reader sees every agreement. A person who needs only their own agreements uses their case list, not the register.

## Consequences

- `docs/modules/contracts/` is folded into `docs/modules/approvals/` (done 2026-10-20): its discovery questions moved there with their ids and text, and the modules list shows one module.
- Before the module ships, the platform also needs: module pages with nested routes and server data loading, composed on the oRPC module contracts of ADR 0011; the notification inbox and its module API (`DEC-21`); and the `s3` adapter in deployments whose documents require it.
- The workflow form engine is module-local. `DEC-28` limits only the core configuration form. Accepting this record does not approve a form library. The form engine and its dependencies need their own decision, against the repository's TanStack Form and zod conventions.
- Secrets stay as environment references for this release. The core outbound HTTP service resolves and sends them, so the module never sees a secret. A screen that lets an administrator type a secret needs a separate storage decision.
- Imported history (agreements from the old system) enters the register as entries with a source id and provenance, with no invented workflow history. The import is idempotent and keeps number continuity. The bulk file migration follows `DEC-20` and has its own procedure.
- Discovery is not closed. Before work starts, `docs/modules/approvals/discovery.md` records an answer map for D-1 to D-12 and the former contracts questions: the source, whether it is a customer fact or a design proposal, and what it blocks. Which workflow groups exist, and who reads each, is recorded there.
- An agent that reads cases or register entries, such as the boss agent of `DEC-29`, reads them only through capabilities that apply this record's rules for the signed-in user.

## Open points

None. The two points of revision 4 were decided by the owner on 2026-10-20: the landing page stays the Solutions hub (`DEC-49` unchanged), and flow definitions live as data with export and import (section 1).

Revisit when a second module needs relations that this table cannot express, such as a relation that depends on another relation. The change then is ADR 0004's relationship engine behind the same `can()` and `scopesFor()` calls, and modules keep writing facts through the same API.

## Review findings and answers

Findings of the critique of revision 1:

| Finding | Answer |
|---|---|
| 1. Two implementations of the relation rule | Section 3: one table and one effective-access rule for detail checks and lists |
| 2. Delegation expiry undecided | Section 3, relation rules for cases: validity windows, no lasting visibility from acting for someone |
| 3. Silent default grant | Section 3: roles seeded unassigned, scoped assignments written by an explicit administrator action |
| 4. Sidebar needs a core change | Section 4: request-time navigation provider |
| 5. Register event incomplete | Section 1: removed by the merge. The register entry and number are written in the completion transaction. |
| 6. No ownership boundary for relations | Section 3: one owner per record type, refused foreign writes and foreign relation scopes |
| 7. Per-record cost and unexplained grants | Section 3: `canMany()`, SQL filter for lists, explanation with the assignment path |
| 8. Invalid permission keys | Section 5 |
| 9. Split not honestly established | Considered options: the split is rejected, with the conditions to split again |
| 10. Deferred work incomplete | Consequences |
| 11. Discovery treated as settled | Consequences: answer map required before work |
| 12. Overstated claims | Bounded wording, with the within-request consistency limit stated |

Findings of the cross-family review of revision 2:

| Finding | Answer |
|---|---|
| 1. Relation scopes have no representation on a role | Section 3: one scoped assignment per relation, relation-only roles refuse a null scope, the rows shown |
| 2. Detail and list agreement not established | Section 3, the effective-access rule |
| 3. Four events not convergent | Removed by the merge: there are no cross-module events |
| 4. Rebuild incomplete and without authority | Removed by the merge: there is no rebuild |
| 5. Stale department and unsafe reconciliation | Section 3: reconciliation from current state with a lock and revision. Department rows removed 2026-10-21: workflow groups derive nothing from membership |
| 6. Copied data and file access undecided | Sections 1 and 2: one owner per file, owner decisions on audiences |
| 7. Picker mixes entry, starting, and acting | Section 4: decision table, TD-035 kept, effective holders query, run-time checks and reassignment |
| 8. Query bound not possible | Section 3: per-record read kept per request, `canMany()` for known sets |
| 9. Totals can leak | Section 7: totals over the caller's readable set only, or no total |
| 10. Principle 9 proofs incomplete | Section 6: placeholder proof for every change, zero-module image must start |
| 11. Hidden contract choices | Sections 3, 4, and 5: refused foreign scopes, explanation fields, designer placement, and the permission and record type compatibility rule |

Findings of the final cross-family review of revision 4:

| Finding | Answer |
|---|---|
| 1. Department access may not converge | Superseded 2026-10-21: no department rows. A workflow group is read from current workflow data on each request, so nothing must converge |
| 2. Revision guard lost on an empty set | Section 3: version table kept for empty sets, compare-and-set replacement for every writer |
| 3. No permission and record type compatibility | Section 3: declared record types per permission, enforced in `can()`, `canMany()`, and lists |
| 4. Register exactly-once rule dropped | Section 1: register invariants |
| 5. Imported entries hidden | Section 1: register availability separate from automatic registration |
| 6. Holders query caller rule | Section 4: the module procedure checks its caller first |
| 7. Stale wording | Revision history, section 1, and annotations in `docs/modules/approvals/` |

Findings of the follow-up review of the fixes (accepted after these):

| Finding | Answer |
|---|---|
| 1. Version must precede the source read | Section 3: read order, retry of the whole read, derive, and write |
| 2. Re-enable must invalidate before it is observable | Superseded 2026-10-21: no derived department rows, so no before-enable step |
| 3. Delay names the wrong person | Superseded 2026-10-21: no membership delay remains |
| 4. Two discovery lines name superseded work | `docs/modules/approvals/discovery.md` |

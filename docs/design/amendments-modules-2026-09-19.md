# Amendments the module reintroduction review needs

Date: 2026-09-19. Author: design owner. Status: raised, not applied. Nothing under `/home/kenan/work/genie-ops-center-v2` was edited.

`architecture/module-removal.md` already decides the behavior: a reintroduced module registers disabled, core shows its retained configuration and access before activation, an administrator may remove unwanted grants and must confirm that enabling restores the rest, and the shared UI and command-line enable path enforces this. The Modules screen contradicted that policy, because it enabled every switched-off module in one step. The screen is corrected. This file lists what the platform documents must say for the corrected screen to be buildable.

The policy also states that the review-evidence representation stays an implementation-design decision. This file therefore names the shape the screen needs and stops. It does not propose tables, columns, or an evidence format.

## Read this first: what v2 already covers

These amendments were first written without checking the current v2 text closely enough. Four of the points below are already settled there. A v2 owner should not spend time on them.

| Already in v2 | Where | What it says |
| --- | --- | --- |
| The durable state must tell a returning module from an ordinary disabled one, and its schema is an open gate | `architecture/data-shape.md`, `tenant_module` | "Durable installed-identity/removal-completion and review evidence must distinguish a returning module from an ordinary disabled one; exact schema and reconciliation ownership remain implementation-design gates." |
| Both UI and CLI enable paths require the review | `specs/01-deployment-and-setup.md`, R-79a | "Both UI and CLI enable paths require administrator review/confirmation of retained grants and valid required configuration." |
| A refused activation is a clean refusal | `architecture/module-removal.md`, lifecycle matrix | "Invalid config, incompatible history or identity reuse: actionable refusal; no partial activation or destructive fallback." |
| Review invalidation under concurrent grant changes, and deliberate work resumption, are open | `architecture/module-removal.md`, closing paragraph | Both are named there as unresolved before controlled removal ships. |

What remains is narrower than it first looked. v2 has decided the behaviour and the durable state. What it has not written is the **read contract**: what the server hands the Modules screen so the screen can present the review at all. Every amendment below is about that, except A2 and A6, which are one sentence each on top of text that already exists.

## Amendments

### A1. The module list response must carry a server-owned activation verdict

Today the screen receives `enabled`, the category, the `<id>:use` key and the role holders. Those cannot tell an ordinary switched-off module from a reintroduced one, because both carry `enabled: false`.

Needed: the response carries an activation verdict per module with two states. `ready` is an ordinary installed module, switched on or off. `review-required` is a module reintroduced after a controlled removal, which stays disabled until its review completes. The client must never derive the state from `enabled`.

Spec 1 R-79a and the module contract must say that the verdict is server-owned and that a client that guesses it is wrong.

### A2. One activation procedure, shared by the screen and the command line

R-79a already requires the review on both paths, so this is one sentence, not a new requirement.

Needed: state that the ordinary enable path **refuses** a module whose verdict is `review-required`, rather than being a second way in that happens to also check. Requiring both paths to check leaves open a third caller that checks neither. Naming one procedure, and making every other path refuse, closes it.

Otherwise the correction is only a client-side courtesy, and a direct call reaches the state the policy forbids.

The screen states this to the administrator in one line: the server runs these checks for the screen and for `genie-ops module enable`, and the confirmation box records a decision rather than enforcing it. The design must not imply that a checkbox is a security control.

### A3. Retained-grant validity is server-derived and read-only in core administration

Needed: for a module awaiting review, the server returns each retained assignment with the recipient id, the recipient name, the role, the scope, the group member count, and a verdict of valid or invalid with a reason.

The verdict is a point in time, read now, for this activation. Valid means the assignment restores when the module is enabled, under the memberships, principal status, resource scope, permission evolution and entitlement of that moment. Invalid means it does not restore in this activation, and the reason says why.

Invalid does not mean revoked and does not mean deleted. The retained assignment stays in `role_assignment`. If the archived group is restored, or the person is re-enabled, or the module declares the permission again, ordinary authorization judges the assignment on its own terms at that later time. No client declaration and no activation may turn a failing current gate into a permanent bar, and nothing in this flow deletes a retained assignment.

The wire wording follows that meaning: the field is the verdict for this activation, not a lifetime judgement. The screen may label the row `Does not restore now`, and it must not say that the assignment can never matter again.

The review reads this list and links to Access, carrying the recipient and the module, so the row the administrator wants to change is the one that opens. It carries no permission editor, because access is granted in one place (`DEC-39`). Removing an unwanted grant happens in Access, and the administrator returns to the review, which re-reads the list.

### A4. The retained configuration must be returned rendered, for reading

The policy asks that retained configuration is shown before activation, and the administrator decides in the review. The review therefore lists it rather than linking to it, because a decision made one navigation away from its own facts is not a review.

Needed: for a module awaiting review, the server returns the kept configuration as one row per declared field, in declared order, each with the field title and the value already rendered for reading. The server renders it for two reasons. Core holds no copy of the module's schema on this screen, so it cannot turn `straight-line` into `Straight line`. And the server decides what may leave the tenant: a secret is never sent and reads as a placeholder, an unset field reads as `Not set`.

A field the server refuses carries its own status and message, so the refusal has an address. The panel shows the one-line summary above the list and marks the field inside it. Editing stays in the module's settings section, which writes `tenant_module.config` and never `tenant_module.enabled`.

The module list endpoint must not be turned into a second read of raw `tenant_module.config`. It returns display rows only, and only for a module whose verdict is `review-required`.

### A5. What activation does not restore must come from the server, not from screen copy

Needed: the response carries the short list of facts about what the return did not bring back, for example revoked inbound credentials, cancelled work, and stopped schedules. The policy already fixes the behavior. The screen must not hard-code the sentences, because which of them apply depends on what the controlled removal actually did to that module.

### A6. A refused activation must return a reason the screen can show

The policy's lifecycle matrix already requires an actionable refusal with no partial activation. What is missing is only that the reason reaches the client.

Needed: one line that the refusal returns a message the screen can print, and that the client keeps the administrator's completed review so a retry is one press rather than a second reading of the whole panel.

## Unresolved, flagged rather than invented

### U1 and U2. The review record and the database shape are already open in v2

`architecture/data-shape.md` already names both as implementation-design gates. The design repository adds nothing and invents nothing. The only thing it needs is that the activation call can prove the review happened. Whether that is a stored record, a token returned by the read, or a re-check at write time stays a backend decision.

### U3. A grant that changes between the read and the confirmation is already open in v2

`architecture/module-removal.md` lists review invalidation under concurrent grant changes as unresolved. The design assumes the server re-reads the grants and refuses a stale confirmation. It does not specify how, and it does not need the answer to be drawn.

The one thing the screen needs when that is settled: if a confirmation is refused as stale, the refusal must be distinguishable from an ordinary failure, because the recovery is different. A stale confirmation asks the administrator to read the list again; a server error asks them to retry the same decision.

### U4. Whether a completed review expires

The screen holds no review across a page load: closing the panel discards the confirmation. Whether a recorded review stays valid for a later command-line activation, and for how long, is not designed here.

### U5. Deliberate work resumption is already open in v2

The policy says cancelled jobs and stopped schedules do not silently resume, and that deliberate resumption must be defined before the removal workflow ships. The review states the fact and offers no control, because there is nothing to offer yet. When it is defined, the review panel is where it belongs, since it is the one place an administrator reads what did not come back.

## Summary for a v2 owner

Four genuinely new requirements, all about the read contract: A1 the activation verdict in the module list response, A3 per-grant validity with a reason, A4 retained configuration returned rendered with secrets excluded, A5 the not-restored facts as data rather than screen copy.

Two one-sentence additions to text that already exists: A2 the ordinary enable path refuses a `review-required` module, A6 the refusal returns a reason the client can print.

One genuinely new open question: U4, whether a recorded review expires.

Four questions that are already open in v2 and need nothing from this repository: U1, U2, U3, U5.

One unrelated wording defect noticed while checking: `architecture/module-contract.md`, the Configuration schema row, still says "The Tenant Settings page renders one card per module with `ConfigForm`". The page is a section navigator now. `product/amendments-settings-2026-09-18.md` A1 already raised this and names both targets.

## Out of scope, deliberately

Module uninstall, permanent data deletion, and the controlled removal an operator runs are separate authorized workflows in `architecture/module-removal.md`. None of them is a tenant administrator screen and none is designed here. Until controlled removal is implemented and its lifecycle tests pass, an upgrade that omits a previously installed module stays prohibited, so this correction designs the return of a module and never its departure.

## Design fixtures, not requirements

`Asset register` exists in `product/sections/audit-and-tenant-settings/data.json` as the sample tenant's reintroduced module. It is a fixture that carries the `review-required` state, its five retained grants, and its four not-restored facts. It is not a planned module. `Approvals` stays the ordinary switched-off module, and the two states sit side by side in the table on purpose.

# Open decisions for the product owner — 2026-09-19

Status on 2026-09-19: **B4 and B5 are accepted and documented in v2. B1 to B3 and B6 to B8 remain
open.** On 2026-09-27 the product owner accepted option A of B1 and option A of B6; Specification 02 R-40 and R-51a record them. B2, B3, B7 and B8 remain open. The accepted text is `docs/architecture/module-contract.md` in v2, under "Category
assignment boundary" and "Settings discovery and authorization". That file is the authority; the
summaries below are a pointer, not a copy, and the design source follows it.

Status of the open rows: **proposed and open**. Nothing in them is accepted. Each row states a recommendation, the
alternatives, what each one costs, and the canonical documents that change if the owner accepts it.
The design source is not changed for any of these eight items, and no v2 amendment is applied.

These eight sit outside the corrections made on 2026-09-19, which covered the
last-active-administrator rule, the Advanced role assignment, the reintroduction journey, the
misleading copy, the modal keyboard behavior, and the token cleanup. That first round is not a
closed set: the v2 owner's verification of 2026-09-19 confirmed all six only in part, a second round
fixed the seven defects it named, and a third added the missing removal path for a directly assigned
role. The change log carries all three rounds. None of that work needed a new product decision. The
eight rows below do.

Corrected on 2026-09-19: an earlier version of this file said "six" in three places while the table
already held eight rows, and it described the first round as closed. The row count and the closure
claim were both wrong.

## Decision table

| # | Decision | Recommendation | Alternatives and what each one costs | Documents that change |
| --- | --- | --- | --- | --- |
| B1 | Who assigns a role when a person is added | **A. Add person calls the one assignment service in the same transaction.** It meets R-40 in one flow and keeps one guarded writer. | **B.** Create the person, then route to Access. Fewer writers to reason about, but the administrator can leave before assigning, and a pre-first-sign-in role is then not guaranteed. **C.** Drop onboarding assignment. Cheapest, and it contradicts R-40. | Spec 2 R-38 and R-40; `product/sections/people-groups-and-roles/spec.md` (the "one writer" wording becomes "one assignment service"); `product/sections/access/spec.md` |
| B2 | The activation read model for a returned module | **A. One server activation endpoint plus one shared activation procedure.** It returns the rendered configuration, a per-assignment verdict for this activation, and the facts about what does not come back. Every other enable path refuses a module whose verdict is `review-required`. | **B.** Reuse the module list endpoint. Cheaper, and it turns a list read into a second read of raw `tenant_module.config`. **C.** Let the client compose the review. Cheapest, and it makes the checkbox look like the control. | `docs/architecture/module-contract.md`; `docs/architecture/module-removal.md`; Spec 5; `product/amendments-modules-2026-09-19.md` A1 to A5 |
| B3 | Review freshness, expiry, and a stale confirmation | **A. The server returns a typed stale result, and the client discards the review and reloads it.** An ordinary error keeps the confirmation and offers Retry. Name no table now. | **B.** Treat every refusal as retryable. That is today's behavior, and it lets a stale decision be resent. **C.** Give the review a durable record with an expiry. Strongest, and it needs a storage decision the design repository must not make. | `docs/architecture/module-removal.md` (concurrent invalidation is left open there); Spec 5 |
| B4 | Who contributes a category write for a module record | **ACCEPTED 2026-09-19.** One Categories page assigns whole modules and module records together. A module declares an optional `listAssignable` and a per-record assign or clear contribution; core dispatches through the compiled registry and touches no module table. Core entry is `core:settings:manage`, and a provider additionally enforces its own record key (Solutions uses `solutions:admin`). Each write targets one record and one core category id or none, is rechecked at write time, and is audited by the owning module. Several rows report per-row outcomes with retry, never a cross-module transaction. Placement never grants access. A disabled compiled module keeps its record placement and contributes no editable record rows; an excluded module contributes nothing; core placement of whole modules stays available while disabled. Counts stay whole-module counts. | — | Accepted in `docs/architecture/module-contract.md`, Category assignment boundary. Design follows it in `product/sections/audit-and-tenant-settings/spec.md`. |
| B5 | Settings metadata, search, and section permissions | **ACCEPTED 2026-09-19.** Navigator A. Reads, writes, navigation and search all require `core:settings:manage`; a section's optional additional permission is an AND restriction, never a substitute, and module administration alone grants nothing here. Fuzzy search reads authorized names, descriptions and keywords only, never saved values or secrets, and a result opens the section and focuses the field or heading. Unauthorized metadata is filtered before it reaches the browser, and links and saves are checked again server-side. A compiled but disabled module with a schema stays configurable through this authorized core path; saving never enables a module and never bypasses reintroduction review. Excluded modules and modules without a schema contribute nothing. | — | Accepted in `docs/architecture/module-contract.md`, Settings discovery and authorization. Design follows it in `product/sections/audit-and-tenant-settings/spec.md`. |
| B6 | Sign-in for existing local accounts once local-account creation is off | **A. The realm keeps a local sign-in and reset route while any local account exists.** The setting governs creation, not the accounts already created (R-51a). | **B.** Refuse the setting while local accounts exist. Clear, and it blocks a tenant that wants to stop creating them. **C.** Require a migration to a brokered account first. Cleanest end state, and it needs a linking flow that does not exist. | Spec 2 R-51a; `product/sections/sign-in-and-tenant-pages/spec.md` and its `types.ts` |
| B7 | What Solutions sends to the browser | **A. Two shapes: a member projection and an authorized `solutions:admin` connection projection.** The member viewer and the streaming request never receive the endpoint, the bot id, the upstream record id, or the session handle. The admin projection carries the editable endpoint and bot id. The operator allow-list, secrets, DNS checks, and session handles stay on the server. | **B.** One shared shape. Today's design, and it sends administration fields to members. **C.** Make the admin fields write-only. It removes the prefill the approved editor needs. | Spec 4 R-16 and R-27; `product/sections/solutions/spec.md` and its `types.ts` |
| B8 | The chat theme shape | **A. Make the reduced shape canonical.** Assistant turns render as plain text, so `assistantBubbleColor` and `assistantBubbleForeground` leave the module contract before any schema work. | **B.** Keep the two fields in storage and leave them unrendered. It persists a decision the design removed and invites a future control. **C.** Restore the controls. It reverses an accepted design decision. | `docs/modules/solutions/README.md` (the `chat_theme.config` description); Spec 4 |

## Notes the table cannot hold

**B1.** The two documents disagree today. Spec 2 R-40 requires role assignment during onboarding.
The Access design says Access is the only writer. Recommendation A resolves this by naming the
shared assignment service, not the screen, as the single writer. The design source keeps `roleIds`
on `NewPersonInput` while this is open, so no selected role is silently thrown away by a contract
change. The preview still does not create the assignment, because creating one would pre-empt this
decision.

**B2 and B3.** No database table is proposed and none is invented. The v2 owner returned narrower
positions on both rows on 2026-09-19, including that a module-list response can carry summary
verdicts without exposing raw configuration. Those positions are recorded in that review, not here,
and this file has not been rewritten to match them, because the rows are still open until the owner
applies the canonical amendments. The confirmation box on the
review screen records the administrator's decision. It is not the control that enforces it, and the
screen says so. The preview proves the journey with synthetic state only. A real activation still
needs the server contract above, plus lifecycle proof against a real database and a real image.

**B7.** R-27 as written forbids sending the endpoint to any browser, and R-16 requires an
administrator to edit that endpoint. Both cannot hold. Recommendation A narrows R-27 to the member
viewer and the streaming request rather than weakening it. No secret and no session handle is
exposed under any option here.

## What happens next

0. B4 and B5 are done. The accepted text is in v2 and this design source follows it. No further
   decision is needed on those two rows, and the summaries above must not be treated as the
   authority: read `docs/architecture/module-contract.md`.
1. For the six rows that remain, the owner picks one option per row, or asks for a different one.
2. The v2 documents named in the last column are amended together, in one change per row.
3. Only then do the affected design specs, types, and fixtures follow.

Until then these remain proposals. Treat them as implementation gates, not as accepted design.

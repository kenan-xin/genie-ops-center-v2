# Spec 0 session handoffs

Prepared by the [2026-09-21 audit](../audit-2026-09-21.md). These are proposed dispatch instructions, not a record that implementation has started. Before sending a prompt, verify that develop contains the reviewed documentation commit. Every new handoff must instruct its recipient to use `wt` to create a new dedicated branch/worktree from current local `develop`, regardless of existing worktrees. A fresh worktree does not inherit uncommitted files.

## Dispatch order

The original first batch integrated at `bcd66e7` and `13800cd`; its [review repair union](../04-context-migrator-and-placeholder/integrated-review.md) integrated and reaccepted S0-04 at `531e8af`. Those prompts are historical. S0-05 owns G2 and runs alone until integrated acceptance; verify its current claim in Beads rather than treating this historical dispatch order as readiness. The table preserves the original lane boundaries.

| Batch | Handoff | Release condition |
| --- | --- | --- |
| First, lane A | [S0-04 database acceptance](s0-04-acceptance.md) | Owner explicitly resumes the retained session or transfers its existing claim |
| First, lane B | [Entrypoint validation, 5ph](5ph-entrypoint-validation.md) | Approved documentation on develop; S0-01 remains accepted |
| Next, alone | [S0-05 production integration/G2](s0-05-g2.md) | S0-04 and 5ph integrated, verified and closed |
| After G2 | [S0-06 through S0-09](post-g2.md) | Integrated passing G2; shared-file writer schedule recorded |

Historical first-batch order: 5ph integrated before S0-04 so the latter's union gates included the selector fix. This record is not a new dispatch instruction. Do not launch downstream runtime work to fill an environmental wait.

## Delivery authority

Sending a complete handoff as an implementation instruction authorizes scoped local checkpoint commits. Local integration through `wt` requires separate owner approval and the reserved integration window. It does not authorize code push, release publication, deployment, host-service changes, live-hook activation or worktree deletion. A prompt merely being present in this repository grants nothing. If the owner sends different limits, those govern.

Preserve accepted decisions. Escalate genuine decisions, ownership conflicts and failed gates. Record the exact integration revision and checks in Beads before closure. Failed or unavailable proof leaves the ticket open.

The human is the integration coordinator between separate Claude sessions. Beads and repository documents carry ownership and handoff records; do not assume sessions can message one another. Only one session may integrate into develop at a time. A sender must reserve that window before the recipient merges; a session without a recorded reservation stops at reviewed local commits.

Before first dispatch, owned children `yt2`, `3yv` and `2cg` stay manually blocked until their parent is claimed with prerequisites satisfied. For a continuation, inspect current child state and preserve completed work; do not replay first-claim transitions. The parent owner transitions and assigns them in one guarded update as specified in the ticket map. Parent-child relationships gate closure but do not keep an open child out of the ready queue. Release no child as an independent lane.

## Shared-file schedule

| Stage | Sole writer and paths | Other lanes |
| --- | --- | --- |
| First batch | S0-04 owns required root/core/placeholder manifests, lockfile and database test configuration; record any expansion of its existing dependency window before editing | 5ph changes only selection implementation/tests and its evidence; no manifest, lockfile, Nx or shared preset edits |
| G2 | S0-05 owns app composition, registry generation, initial image, runtime transports and required shared configuration | No sibling runtime work |
| Post-G2 window 1 | S0-06 owns root/Nx selection inputs, registry/build/image-prep metadata, resolver and shared selection interface | S0-07/08/09 work only on their owned files using the accepted G2 baseline |
| Post-G2 windows 2, 3, 4 | S0-07, then S0-08, then S0-09 may each make their required shared configuration/dependency changes after the preceding writer releases the window | Each records exact paths and updates from integrated develop before touching shared files |

The post-G2 windows are an agreed schedule to record on dispatch, not permission to race. If a lane needs an earlier shared change, the human explicitly transfers the window in the affected beads. This does not add whole-ticket prerequisite edges between the four lanes. Integration may follow review readiness, serialized by the human, while preserving the writer windows.

Shared surfaces include root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `nx.json`, shared presets, package export maps, app root/provider composition and root test configuration. S0-06 owns the selection contract; S0-08 consumes it rather than adding another resolver. S0-07 owns migrator/isolation internals. S0-09 owns devtools/messages. Storybook host changes belong to S0-10 after its prerequisites. Coordinate tracked AGENTS.md/CLAUDE.md changes with the existing `3l5` owner; edit in the assigned worktree.

## Common acceptance boundary

Use native project commands through Nx and record nonempty targets, exact results and meaningful negative controls. No skipped real database, browser, cache-content or production-image proof may be relabeled as a pass. Preserve the approved pins, module naming, import direction, placeholder-only authorization stub, tenant visibility, local-only cache, minimal CSP and native-first complexity stop. Product decisions and deferred dependency removals are not implicit cleanup work.

# Spec 0 session handoffs

Prepared against integrated develop `6b4edec`. These are dispatch instructions, not a record that implementation has started. Before sending a prompt, verify that develop contains the approved documentation update. Start in the session's assigned checkout. If it is already the task's dedicated worktree, including one created by Orca, reuse it. Only when outside a task worktree, use `wt` to create a dedicated branch/worktree from current local `develop`. Verify branch, accepted baseline and task ownership before editing. If the existing worktree belongs to another task or contains conflicting work, stop and ask; do not overwrite it or automatically create another worktree. A continuation preserves its assigned worktree and work.

## Dispatch order

The original first batch integrated at `bcd66e7` and `13800cd`; its [review repair union](../04-context-migrator-and-placeholder/integrated-review.md) integrated and reaccepted S0-04 at `531e8af`. Those prompts are historical. S0-05/G2 integrated at `3bafa24` and is closed, as are yt2 and 3yv. Its prompt is historical; use the four post-G2 handoffs after verifying current Beads prerequisites and the approved documentation baseline. The table preserves the original lane boundaries.

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

`yt2` and `3yv` are completed; do not reopen or reclaim them. Before S0-10 first dispatch, owned child `2cg` stays manually blocked until its parent is claimed with prerequisites satisfied. For a continuation, inspect current child state and preserve completed work; do not replay first-claim transitions. The parent owner transitions and assigns them in one guarded update as specified in the ticket map. Parent-child relationships gate closure but do not keep an open child out of the ready queue. Release no child as an independent lane.

## Shared-file schedule

| Stage | Sole writer and paths | Other lanes |
| --- | --- | --- |
| First batch | S0-04 owns required root/core/placeholder manifests, lockfile and database test configuration; record any expansion of its existing dependency window before editing | 5ph changes only selection implementation/tests and its evidence; no manifest, lockfile, Nx or shared preset edits |
| G2 | S0-05 owns app composition, registry generation, initial image, runtime transports and required shared configuration | No sibling runtime work |
| Post-G2 window 1 | S0-06 owns root/Nx selection inputs, registry/build/image-prep metadata, resolver and shared selection interface | S0-07/08/09 work only on their owned files using the accepted G2 baseline |
| Post-G2 windows 2, 3, 4 | S0-07, then S0-08, then S0-09 may each make their required shared configuration/dependency changes after the preceding writer releases the window | Each records exact paths and updates from integrated develop before touching shared files |

The post-G2 windows are an agreed schedule to record on dispatch, not permission to race. If a lane needs an earlier shared change, the human explicitly transfers the window in the affected beads. This does not add whole-ticket prerequisite edges between the four lanes. Integration may follow review readiness, serialized by the human, while preserving the writer windows.

The coordinator records the owner, exact paths and release revision in the affected beads before a shared-file window starts. A lane with no shared edits explicitly releases its turn; it does not hold later lanes until whole-ticket completion. Changes to a shared interface are integrated and communicated before consumers update their baselines. Independent work continues meanwhile.

Reserve one heavy Docker acceptance run at a time across these sessions. Isolated worktrees still share the Docker daemon, image tags, Compose project names and published ports. Each run records its image identity and resource names, uses lane-specific names/ports where the harness supports them, and cleans up only resources it created. The reserved run may contain the concurrency required by its tests, including S0-06 isolated selections and S0-07 competing migrator processes; serialization between agents must not weaken those tests. Baseline harness changes for resource isolation follow the shared-file protocol.

Shared app acceptance helpers, required-case manifests, fixture image tooling, and image preparation are also coordinated surfaces. S0-06 owns build/selection changes; S0-07 owns isolation/failure assertions. Agree the exact file owner before either edits a common harness file. Worktrees alone do not resolve that overlap.

Shared surfaces include root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `nx.json`, shared presets, package export maps, app root/provider composition and root test configuration. S0-06 owns the selection contract; S0-08 consumes it rather than adding another resolver. S0-07 owns migrator/isolation internals. S0-09 owns devtools/messages. Storybook host changes belong to S0-10 after its prerequisites. Coordinate tracked AGENTS.md/CLAUDE.md changes with the existing `3l5` owner; edit in the assigned worktree.

## Common acceptance boundary

Use native project commands through Nx and record nonempty targets, exact results and meaningful negative controls. No skipped real database, browser, cache-content or production-image proof may be relabeled as a pass. Preserve the approved pins, module naming, import direction, placeholder-only authorization stub, tenant visibility, local-only cache, minimal CSP and native-first complexity stop. Product decisions and deferred dependency removals are not implicit cleanup work.

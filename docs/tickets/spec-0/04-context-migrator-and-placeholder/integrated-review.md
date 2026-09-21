# S0-04 integrated review and next dispatch

Review baseline: develop `f8b797f`, compared with `ad26481`. Review task: `genie-ops-center-v2-2r9`. The owner requested quality review, fixes or filed findings, tracker reconciliation and a next-batch plan. This does not start S0-05 or authorize a new architecture.

## Integration and acceptance

Entrypoint validation (`5ph`) integrated at `bcd66e7` and remains closed. S0-04 integrated at `13800cd` after real-database end-state tests; `2tc` records the successful disposable endpoint run. Those runs remain valid historical evidence.

Independent review of the integrated code reproduced defects and identified an explicit S0-04 proof gap. S0-04 is reopened. Its original assignee is preserved as history; bounded repair owners live on the findings below. Repairs are prepared on `bugfix/spec0-integration-review` from `f8b797f`, not directly on develop. An uncommitted repair or unit pass is not integrated acceptance.

| Finding | Bead | Required disposition |
| --- | --- | --- |
| Pino interpolation objects, raw authorization headers and embedded non-HTTP credential URLs escape redaction | `azn` | Serialized-output red/green tests; preserve caller objects, error kinds and causes |
| Setup failure/false advisory unlock can permit client reuse without confirmed cleanup; cleanup cause is lost | `udb` | Destroy uncertain clients, confirm unlock, retain diagnostics and guarantee release even if logging fails |
| Logger and placeholder factory are inaccessible through legal public package entrypoints | `j2q` | Export bounded runtime/logger and test-only factory seams; by-name consumer tests |
| Real database tests do not observe one backend for lock, history and ledger queries | `2ht` | Real Postgres PID/query evidence and a meaningful negative control; static wiring is not enough |
| Migration-failure text falsely promises the whole database is unchanged | `ci5` | Safe message must describe startup failure without cross-history rollback promise |
| AdminPage lacks the required documented story and component assertion | `8uy` | Deterministic visible-output/a11y proof before app consumption |
| Inventory ID parser reports malformed values as naming mismatches | `0ij` | Existing separately filed follow-up; manifest-specific type diagnostic without changing naming/duplicate behavior |

These findings do not pull forward S0-05's app/image/header/two-context/browser proof or S0-07's adversarial multi-process matrix. Every confirmed finding is tracked; SuperCov scores alone are not tickets or acceptance findings.

## Repair disposition before integration

Every finding above now has a bounded repair and independent review on `bugfix/spec0-integration-review`. The final logging review found no remaining P1/P2 after the public logger was narrowed to an explicit redacting interface rather than exposing raw Pino callbacks and child customization. The other repaired surfaces survived the whole-patch review: conservative migrator cleanup, public package seams, the real same-session proof, safe migration text, AdminPage Storybook coverage and the inventory-ID diagnostic.

This is reviewed branch evidence, not integrated acceptance. Close the finding beads and reaccept S0-04 only after the repair branch is committed, integrated into current develop and the applicable union checks pass there.

## Fresh verification at f8b797f

`pnpm exec nx run-many -t lint typecheck test test:integration -p @genie/core @genie/module-placeholder @genie/generators --skip-nx-cache` passed nine lint/typecheck/unit tasks. Both integration targets failed during container setup: five core failures and four skipped placeholder cases after a failed setup hook. A serial integration retry also failed, so target concurrency did not explain the failure.

`docker version` returned Engine 29.8.0, but `docker ps` and `DEBUG=testcontainers*` on the placeholder integration target reported HTTP 503: `Docker Desktop is unable to start`, `qemu: process terminated unexpectedly: exit status 1`. The intended `desktop-linux` socket was unchanged. Current runtime blocker: `of8`. No host service, credential or endpoint was changed. A working version endpoint does not prove a working container runtime.

## Repair-union verification after Docker recovery

The owner restarted Docker Desktop. No agent changed its service, credentials or endpoint. On the intended `desktop-linux` context, the repair union then passed:

| Command | Result |
| --- | --- |
| `pnpm nx run-many -t test lint typecheck -p @genie/core,@genie/generators,@genie/module-placeholder --skip-nx-cache` | 9 of 9 targets passed |
| `pnpm nx run @genie/storybook:test-storybook --skip-nx-cache` | 4 files, 12 tests passed, including AdminPage |
| `pnpm nx run @genie/core:test:integration --skip-nx-cache` | 7 real-Postgres cases passed, including same-session PID/query evidence and its foreign-session negative control |
| `pnpm nx run @genie/module-placeholder:test:integration --skip-nx-cache` | 4 real-Postgres cases passed |
| `npx supercov quality patch --base f8b797f --all` | completed; independent review found no remaining actionable P1/P2 |
| `git diff --check` | passed |

One earlier core integration attempt passed six cases and timed out while Testcontainers waited for the seventh container's host port. The failed negative control then passed alone, and the complete seven-case suite passed on the immediate serial rerun. This is recorded as Docker/Testcontainers startup flakiness, not hidden as a clean first attempt and not treated as an assertion failure.

## SuperCov scope and triage

The initial `origin/main` attempt used the wrong baseline and failed on an old binary PNG; it supplied no verdict. The owner explicitly corrected the baseline. The usable review is `npx supercov quality patch --base ad26481 --json`, with fixes compared against `f8b797f`.

The default patch scope reviewed 18 production files. A separate `npx supercov quality patch tools/generators/src/selection --base ad26481 --all --json` reviewed all four changed selector files, including tests and tooling omitted by automatic source classification. A final whole-range `npx supercov quality patch --base ad26481 --all --json` completed for 41 source/test/config files; the other 22 changed files are non-source documentation, SQL or manifests and were inspected separately where relevant.

Signals included logging/migrator method length, error/environment conditional complexity, duplicated logic and magic values. Review found specific redaction/cleanup defects above rather than treating those scores as proof. Fluent Drizzle/Testcontainers chains, fixed protocol/lock constants, explicit module fixture values and repeated independent test assertions are not themselves defects. Broad helper extraction or abstractions solely to lower a score are outside this repair.

The all-files pass also flagged hardcoded secrets in tests. These are synthetic `.invalid` connection strings and intentional redaction sentinels, not deployable credentials; removing them would weaken the tests. Error-message regression assertions intentionally repeat the expected literal rather than read it from the catalogue being tested.

## Next batch

Confidence: 8.8/10 for the sequencing, not for unexecuted G2 compatibility. The repair set, real database proof and dependency order are now independently checked. Native framework context/header composition remains the G2 uncertainty.

1. Commit and integrate the reviewed repair union into current develop, rerun applicable union checks, then close `of8`, `2ht` and the repair findings against that integrated evidence and reaccept S0-04.
2. Dispatch **S0-05 alone** with its existing [G2 handoff](../handoffs/s0-05-g2.md), consuming the accepted repaired baseline. Deliver `yt2` and `3yv` inside that owner session; keep them manually blocked until parent claim and prerequisites pass.
3. Only after integrated G2, release the **S0-06/S0-07/S0-08/S0-09** parallel batch under the recorded shared-file schedule.

Native G2 feasibility remains its own hard stop; this review chooses no custom server, extra pool or workaround. Assumption: no other session writes the repair-owned surfaces concurrently.

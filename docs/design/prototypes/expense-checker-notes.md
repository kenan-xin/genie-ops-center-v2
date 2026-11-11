# Expense Claim Checker — throwaway workflow prototype

Question: can finance understand and resolve a claim exception without confusing review with approval or reimbursement?

Owner requested the prototype skill and a separate worktree. This uses the logic branch: one HTML file, pure state transitions, guided scenarios and free-play actions. The existing prototype styling informs the shell; this is not a production component or an application route.

Open `expense-checker.prototype.html` directly in a browser. No install or server is needed. Data resets on reload. The optional local preview serves this directory only.

Scope: three fictional receipts, SGD only, fixed per-receipt limits (meal 80, transport 60), exact sample-file deduplication, missing-date completion, review notes, reopening, locally calculated preset answers. No real PDF reading, AI, approval, reimbursement, persistence or integration. Duplicate detection compares sample file keys, not real hashes. Reviewed exceptions remain flagged; totals never imply money paid.

Tracking: [cvij.8] Prototype expense claim checking workflow. Branch: `codex/expense-checker-prototype`, based on `827ee730f6640037b51ede3f0e1e176b1a5b08bf`.

## Execution checklist

- [x] Read skill, existing module and prototype conventions; create isolated worktree and claim planning task.
- [x] Build self-contained workflow prototype with visible state and guided cases.
- [x] Check financial invariants and forbidden transitions with an ephemeral self-check.
- [x] Verify interactions and desktop/phone appearance in BrowserOS neo.
- [x] Run repository documentation validation.
- [x] Capture prototype and evidence on the throwaway branch; link in Beads.

## Decision

Awaiting owner feedback. No design or business-policy decision is approved by this prototype, and no production implementation is authorized. The prototype remains on its own branch; nothing is promoted to develop.

## Verification — 11 Nov 2026

- Ephemeral Node self-check passed: SGD 171 total / two unresolved exceptions; duplicate does not inflate totals; missing and invalid dates refused; blank exception note refused; reviewed meal retains SGD 45 excess; reopening restores attention; exact limit passes and one cent above flags; source receipt unchanged. No test suite added, as requested by the prototype skill.
- BrowserOS neo session `codex/expense-checker-prototype`: all four guided walkthroughs passed via native clicks. Expected and observed: one taxi remains SGD 28 after duplicate; incomplete claim cannot be reviewed; corrected date enables review; reviewed exception retains its flag.
- A markdown-read check initially could not see the textarea value; the accessibility snapshot confirmed it was retained. No application failure.
- Manual form checks passed on the phone viewport: date entry and review; exception note and review; date edit keeps the previous note. Keyboard arrows switch scenario tabs. Starting the first guided step resets prior free-play state.
- Preset spending answer: Transport SGD 46, Meals SGD 125; reload resets to zero claims.
- Desktop 1440px and phone 390px screenshots captured in the browser session; inspected layout for clipping and readable stacked controls. No console errors or warnings reported. This proves the standalone demo only, not production UI or backend behavior.
- `pnpm validate` passed. Only documentation/prototype files are changed; no production gate or Storybook suite is applicable to this standalone logic demo.
- Preview: `http://127.0.0.1:4318/expense-checker.prototype.html`. Reopen the HTML directly if the local preview is stopped.
